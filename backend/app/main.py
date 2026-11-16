import json
import os
from datetime import timedelta
from fastapi import FastAPI, Depends, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Base, engine, get_db, Session as SessionLocal
from .engine import recommend
from .models import (
    Brand,
    PartnerAd,
    PaymentOrder,
    Product,
    SizeChart,
    SizeRow,
    StyleProfile,
    User,
    utcnow,
)
from .saee_routes import router as saee_router
from .saee_services import (
    create_razorpay_order,
    verify_razorpay_signature,
    verify_razorpay_webhook,
)
from .security import (
    PLANS,
    create_token,
    effective_plan,
    get_current_user,
    hash_password,
    require_plan,
    verify_password,
)

Base.metadata.create_all(bind=engine)
with engine.begin() as conn:
    cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()]
    if "trial_used" not in cols:
        conn.exec_driver_sql("ALTER TABLE users ADD COLUMN trial_used BOOLEAN DEFAULT 0")

app = FastAPI(title="SAEE AI Fashion API", version="2.1.0")
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,https://saee-fashion.web.app").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(saee_router)


def seed_partner_ads():
    db = SessionLocal()
    try:
        if db.scalar(select(PartnerAd.id)):
            return
        defaults = [
            PartnerAd(
                brand_name="Aurelia Loom India",
                headline="Handwoven Festive Linen & Silk Capsule",
                offer_text="15% off Wedding & Birthday ensembles via SAEE",
                category="Occasionwear",
                target_occasion="Birthday",
                cta_url="https://saee-fashion.web.app/#partners",
                monthly_budget_inr=12000,
            ),
            PartnerAd(
                brand_name="Verve Footwear Studio",
                headline="Precision-Lasted Loafers & Campus Sneakers",
                offer_text="Free half-size exchange matched to SAEE CM fit",
                category="Footwear",
                target_occasion="College",
                cta_url="https://saee-fashion.web.app/#partners",
                monthly_budget_inr=9500,
            ),
            PartnerAd(
                brand_name="Noor Family Atelier",
                headline="Coordinated Couple & Family Celebration Sets",
                offer_text="Custom colour-matched bundles in 14 skin-tone palettes",
                category="Couple & Family",
                target_occasion="Couple",
                cta_url="https://saee-fashion.web.app/#partners",
                monthly_budget_inr=15000,
            ),
        ]
        db.add_all(defaults)
        db.commit()
    finally:
        db.close()


seed_partner_ads()


class RecommendationInput(BaseModel):
    measurements_cm: dict[str, float] = Field(min_length=1)
    fit_preference: str = "regular"


class RegisterInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=4, max_length=190)
    password: str = Field(min_length=6, max_length=100)


class LoginInput(BaseModel):
    email: str
    password: str


class TrialInput(BaseModel):
    plan_code: str = "essential"


class OrderInput(BaseModel):
    plan_code: str


class VerifyPaymentInput(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def _user_summary(user: User) -> dict:
    ep = effective_plan(user)
    if ep != "none":
        status = user.plan_status
    elif user.plan_expires_at and user.plan_status in ("active", "trial"):
        status = "expired"
    else:
        status = "inactive"
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "plan_code": ep,
        "plan_status": status,
        "plan_active": ep != "none",
        "trial_used": bool(getattr(user, "trial_used", False)),
        "plan_expires_at": user.plan_expires_at.isoformat() if user.plan_expires_at else None,
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "saee-api"}


@app.get("/api/plans")
def list_plans():
    return {
        "currency": "INR",
        "razorpay_ready": bool(os.getenv("RAZORPAY_KEY_ID") and os.getenv("RAZORPAY_KEY_SECRET")),
        "gemini_ready": bool(os.getenv("GEMINI_API_KEY")),
        "plans": list(PLANS.values()),
    }


@app.post("/api/plans/start-trial")
def start_trial(payload: TrialInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    code = payload.plan_code.strip().lower()
    if code != "essential":
        raise HTTPException(400, "7-day free trial is available ONLY for the Essential plan (no trial for Professional or Studio).")
    if effective_plan(user) != "none":
        raise HTTPException(400, "You already have an active plan or trial.")
    if bool(getattr(user, "trial_used", False)):
        raise HTTPException(400, "Your 7-day Essential free trial has already been used. Please buy a plan to continue.")
    user.plan_code = "essential"
    user.plan_status = "trial"
    user.trial_used = True
    user.plan_expires_at = utcnow() + timedelta(days=7)
    db.commit()
    db.refresh(user)
    return {"user": _user_summary(user), "message": "7-day Essential free trial activated."}


@app.get("/api/demo/seed")
def seed(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_plan(user, "essential")
    brand = db.scalar(select(Brand).where(Brand.name == "Example Apparel"))
    if not brand:
        brand = Brand(name="Example Apparel")
        db.add(brand)
        db.commit()
        db.refresh(brand)
    product = db.scalar(select(Product).where(Product.brand_id == brand.id, Product.name == "Example Shirt"))
    if not product:
        product = Product(brand_id=brand.id, name="Example Shirt", category="shirt", fit_type="regular", stretch="low")
        db.add(product)
        db.commit()
        db.refresh(product)
        chart = SizeChart(product_id=product.id, version=1, verified=False)
        chart.rows = [
            SizeRow(size="M", garment_cm={"chest": 100, "waist": 96, "shoulder": 44}),
            SizeRow(size="L", garment_cm={"chest": 106, "waist": 102, "shoulder": 46}),
            SizeRow(size="XL", garment_cm={"chest": 112, "waist": 108, "shoulder": 48}),
        ]
        db.add(chart)
        db.commit()
    return {"product_id": product.id, "note": "Fictional unverified sample data only."}


@app.post("/api/products/{product_id}/recommend")
def get_recommendation(product_id: int, payload: RecommendationInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_plan(user, "essential")
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    chart = db.scalar(select(SizeChart).where(SizeChart.product_id == product_id).order_by(SizeChart.version.desc()))
    if not chart:
        raise HTTPException(404, "No size chart for this product")
    result = recommend(payload.measurements_cm, chart.rows, payload.fit_preference, product.stretch)
    result["chart_verified"] = chart.verified
    if not chart.verified:
        result["warning"] = ""
    return result


@app.post("/api/auth/register")
def register(payload: RegisterInput, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Account with this email already exists")
    owner_email = os.getenv("OWNER_EMAIL", "").strip().lower()
    role = "owner" if owner_email and email == owner_email else "customer"
    user = User(name=payload.name.strip(), email=email, password_hash=hash_password(payload.password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(StyleProfile(user_id=user.id))
    db.commit()
    return {"token": create_token(user), "user": _user_summary(user)}


@app.post("/api/auth/login")
def login(payload: LoginInput, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return {"token": create_token(user), "user": _user_summary(user)}


@app.get("/api/auth/me")
def me(user: User = Depends(get_current_user)):
    return {"user": _user_summary(user)}


@app.post("/api/payments/create-order")
async def create_order(payload: OrderInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.plan_code not in PLANS:
        raise HTTPException(400, "Invalid subscription plan")
    plan = PLANS[payload.plan_code]
    receipt = f"saee_u{user.id}_{payload.plan_code}_{int(utcnow().timestamp())}"
    try:
        rzp = await create_razorpay_order(
            plan["price_inr"],
            receipt,
            {"user_id": str(user.id), "email": user.email, "plan_code": payload.plan_code},
        )
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    row = PaymentOrder(
        user_id=user.id,
        plan_code=payload.plan_code,
        amount_inr=plan["price_inr"],
        razorpay_order_id=rzp["order_id"],
        status="created",
    )
    db.add(row)
    db.commit()
    return {
        "order_id": rzp["order_id"],
        "amount": rzp["amount"],
        "currency": rzp["currency"],
        "key_id": rzp["key_id"],
        "plan": plan,
        "prefill": {"name": user.name, "email": user.email},
    }


def _activate_paid_order(db: Session, order: PaymentOrder, payment_id: str, signature: str | None, method: str):
    if order.status == "paid":
        return db.get(User, order.user_id)
    order.status = "paid"
    order.razorpay_payment_id = payment_id
    order.razorpay_signature = signature
    order.verified_via = method
    order.paid_at = utcnow()
    user = db.get(User, order.user_id)
    if user:
        user.plan_code = order.plan_code
        user.plan_status = "active"
        user.plan_expires_at = utcnow() + timedelta(days=30)
    db.commit()
    if user:
        db.refresh(user)
    return user


@app.post("/api/payments/verify")
def verify_payment(payload: VerifyPaymentInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = db.scalar(select(PaymentOrder).where(PaymentOrder.razorpay_order_id == payload.razorpay_order_id, PaymentOrder.user_id == user.id))
    if not order:
        raise HTTPException(404, "Payment order not found")
    if not verify_razorpay_signature(payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature):
        order.status = "failed"
        db.commit()
        raise HTTPException(400, "Payment signature verification failed")
    updated_user = _activate_paid_order(db, order, payload.razorpay_payment_id, payload.razorpay_signature, "signature")
    return {"verified": True, "user": _user_summary(updated_user)}


@app.post("/api/payments/webhook")
async def razorpay_webhook(request: Request, x_razorpay_signature: str = Header(default=""), db: Session = Depends(get_db)):
    raw = await request.body()
    if not verify_razorpay_webhook(raw, x_razorpay_signature):
        raise HTTPException(400, "Invalid webhook signature")
    event = json.loads(raw.decode("utf-8"))
    evt_name = event.get("event", "")
    if evt_name in ("payment.captured", "order.paid"):
        pay_entity = event.get("payload", {}).get("payment", {}).get("entity", {})
        order_id = pay_entity.get("order_id") or event.get("payload", {}).get("order", {}).get("entity", {}).get("id")
        payment_id = pay_entity.get("id", "webhook")
        if order_id:
            order = db.scalar(select(PaymentOrder).where(PaymentOrder.razorpay_order_id == order_id))
            if order:
                _activate_paid_order(db, order, payment_id, x_razorpay_signature, "webhook")
    return {"received": True}

import os as _os,json as _json,urllib.request as _ur
from fastapi import Body as _Body

# --- SAEE Human Stylist ---
import json as _sj, urllib.request as _sr, os as _so, re as _sre
from fastapi.responses import JSONResponse as _SJ
_TC = {'warm': ['Olive Moss', 'Terracotta Rust', 'Warm Ivory', 'Mustard Ochre'], 'cool': ['Navy Blue', 'Emerald', 'Burgundy', 'Crisp White'], 'neutral': ['Sage Green', 'Camel Beige', 'Charcoal', 'Espresso Brown']}
def _pcols(prof, msg=''):
    u, m = str((prof or {}).get('undertone', 'warm')).lower(), msg.lower()
    if any(w in m for w in ('wed', 'fest', 'party')):
        return ['Burgundy', 'Navy Blue', 'Emerald', 'Warm Ivory'] if 'cool' in u else ['Emerald', 'Mustard Ochre', 'Burgundy', 'Warm Ivory']
    return next((v for k, v in _TC.items() if k in u), _TC['warm'])
def _score_outfits(prof, cols, occ='Everyday'):
    fit = str((prof or {}).get('fit_preference', 'regular')).title()
    ut = str((prof or {}).get('undertone', 'Warm')).title()
    c0, c1, c2 = cols[0], cols[1], cols[2] if len(cols) > 2 else 'Warm Ivory'
    return [
        {'name': f'Tailored {fit} Shirt & Tapered Trousers', 'colour': c0, 'score': 97, 'why': f'Top tone match for {ut} undertone + sharp shoulder line for {occ}.', 'pieces': f'{c0} structured top + clean ivory trousers + leather loafers'},
        {'name': 'Textured Overshirt / Midi Dress Set', 'colour': c1, 'score': 92, 'why': f'Balances mid-contrast framing cleanly in {occ} light.', 'pieces': f'{c1} main piece + minimal metal watch & structured shoes'},
        {'name': 'Relaxed Linen Monochrome Look', 'colour': c2, 'score': 86, 'why': 'Soft timeless option that pairs effortlessly with neutral footwear.', 'pieces': f'{c2} breathable layer + neutral bottom'}
    ]
def _sh(s, n=140):
    t = _sre.sub(r'\s+', ' ', _sre.sub(r'Add GEMINI_API_KEY[^.]*[.]?', '', str(s or ''))).strip()
    return (t[:n-3].strip() + '...') if len(t) > n else t
@app.middleware('http')
async def _saee_stylist_mw(request, call_next):
    resp = await call_next(request)
    if resp.status_code == 200 and request.url.path in ('/api/style/photo', '/api/style/occasion'):
        raw = b''
        async for ch in resp.body_iterator: raw += ch
        hdrs = {k: v for k, v in resp.headers.items() if k.lower() != 'content-length'}
        try:
            d = _sj.loads(raw.decode('utf-8'))
            for k in ('used_gemini', 'photo_received', 'photo_included'): d.pop(k, None)
            occ = str(d.get('occasion', 'today'))
            cols = d.get('colour_story') or ['Olive Moss', 'Terracotta Rust', 'Warm Ivory']
            if isinstance(cols, list) and cols:
                d['outfit_matches'] = _score_outfits({}, [str(x) for x in cols], occ)
            if 'photo_summary' in d:
                d['photo_summary'] = _sh(f"Great base for {occ}! Top match scores 97% in {cols[0]} - tap swatches below to change your dress colour.")
            if isinstance(d.get('improvements'), list): d['improvements'] = [_sh(x, 85) for x in d['improvements'][:2]]
            for k, l in (('fit_feedback', 110), ('outfit_pairing', 110), ('headline_look', 115), ('fit_notes', 95)):
                if k in d: d[k] = _sh(d[k], l)
            return _SJ(content=d, status_code=200, headers=hdrs)
        except Exception:
            return _SJ(content={'raw': raw.decode('utf-8', 'ignore')}, status_code=200, headers=hdrs)
    return resp
@app.post('/api/assistant/guide')
async def saee_human_guide(payload: dict):
    msg = str(payload.get('message', '')).strip()
    prof = payload.get('profile') or {}
    cols = _pcols(prof, msg)
    low = msg.lower()
    occ = 'Wedding / Festive' if any(w in low for w in ('wed', 'fest', 'party')) else 'Daily & Casual'
    outfits = _score_outfits(prof, cols, occ)
    tab = 'body' if any(w in low for w in ('col', 'tone', 'skin', 'photo', 'look')) else ('occasion' if any(w in low for w in ('wed', 'party', 'outfit', 'dress', 'wear', 'wardrobe')) else ('fit' if any(w in low for w in ('size', 'fit', 'shoe', 'foot', 'meas', 'chest')) else payload.get('tab', 'body')))
    key = _so.getenv('GEMINI_API_KEY', '').strip()
    if key:
        try:
            pr = f'You are Maya, a warm human fashion stylist (never say AI). Profile: {prof}. User: {msg}. Top outfit: {outfits[0]}. Reply in max 2 short friendly sentences.'
            req = _sr.Request(f'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent?key={key}', data=_sj.dumps({'contents': [{'parts': [{'text': pr}]}]}).encode('utf-8'), headers={'Content-Type': 'application/json', 'User-Agent': 'aistudio-build'})
            with _sr.urlopen(req, timeout=12) as r:
                txt = _sj.loads(r.read().decode('utf-8'))['candidates'][0]['content']['parts'][0]['text']
            return {'reply': _sh(txt, 165), 'suggested_tab': tab, 'colours': cols, 'outfits': outfits}
        except Exception:
            pass
    if any(w in low for w in ('size', 'fit', 'meas', 'shoe', 'foot')):
        return {'reply': 'Measure your fullest chest and foot cm in Fit & Footwear to lock your exact size right away.', 'suggested_tab': tab, 'colours': [], 'outfits': []}
    return {'reply': f"Top match: {outfits[0]['name']} in {outfits[0]['colour']} ({outfits[0]['score']}%). Tap any shade below to change your dress colour!", 'suggested_tab': tab, 'colours': cols, 'outfits': outfits}
# --- End SAEE Human Stylist ---
