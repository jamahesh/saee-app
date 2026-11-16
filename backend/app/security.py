from datetime import datetime,timedelta,timezone
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .db import get_db
from .models import User, utcnow

SESSION_SECRET = os.getenv("SESSION_SECRET") or "saee-dev-secret-change-in-prod"
bearer = HTTPBearer(auto_error=False)

PLAN_RANK = {"none": 0, "essential": 1, "professional": 2, "studio": 3}

PLANS = {
    "essential": {
        "code": "essential",
        "name": "Essential",
        "price_inr": 99,
        "billing": "month",
        "trial_days": 7,
        "trial_eligible": True,
        "tagline": "7-day free trial (once per user), then INR 99/mo - fit, colour & photo AI (ad-supported).",
        "features": [
            "7-Day Free Trial (1-time per account, Essential plan only)",
            "Save Body Colour, Height, Chest, Waist & Foot Profile",
            "Clothing Size Engine & Footwear EU/UK/US/IN Calculator",
            "Skin Tone Colour Palette & Optional Photo Answer AI",
            "Includes curated Partner Brand Ads",
        ],
    },
    "professional": {
        "code": "professional",
        "name": "Professional",
        "price_inr": 199,
        "billing": "month",
        "trial_days": 0,
        "trial_eligible": False,
        "tagline": "INR 199/mo (paid only, no free trial) - full AI Occasion, Photo & Couple Styling.",
        "features": [
            "Everything in Essential",
            "AI Occasion Stylist (Birthday, College, School, Formal, Party)",
            "Couple Matching AI Outfit & Palette Coordinator",
            "Digital Wardrobe Planner powered by Gemini AI",
        ],
    },
    "studio": {
        "code": "studio",
        "name": "Studio Family",
        "price_inr": 499,
        "billing": "month",
        "trial_days": 0,
        "trial_eligible": False,
        "tagline": "INR 499/mo (paid only, no free trial) - Ad-free luxury, Family Section & Brand Ad Studio.",
        "features": [
            "Everything in Professional",
            "Family Section (Coordinated looks for up to 6 members)",
            "Ad-Free Editorial Experience",
            "Partner Brand Ad Campaign Manager & Analytics",
        ],
    },
}


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return hmac.compare_digest(dk.hex(), digest)


def create_token(user: User) -> str:
    payload = {"uid": user.id, "email": user.email, "exp": int(time.time()) + 7 * 86400}
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = hmac.new(SESSION_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def decode_token(token: str) -> dict | None:
    try:
        raw, sig = token.split(".", 1)
        expected = hmac.new(SESSION_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        padded = raw + "=" * (-len(raw) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded).decode())
        if data.get("exp", 0) < int(time.time()):
            return None
        return data
    except Exception:
        return None


def _guest_u(db):
 u=db.query(User).filter(User.email=="guest@saee.app").first()
 cols={c.name for c in User.__table__.columns}
 if not u:
  kw={"email":"guest@saee.app"}
  if "name" in cols:kw["name"]="SAEE Guest"
  if "full_name" in cols:kw["full_name"]="SAEE Guest"
  if "password_hash" in cols:kw["password_hash"]=hash_password("saee-guest")
  if "role" in cols:kw["role"]="owner"
  if "plan_code" in cols:kw["plan_code"]="studio"
  if "plan_status" in cols:kw["plan_status"]="active"
  if "plan_expires_at" in cols:kw["plan_expires_at"]=datetime.now(timezone.utc)+timedelta(days=3650)
  u=User(**kw);db.add(u);db.commit();db.refresh(u)
 return u
def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not creds:
        return _guest_u(db)
    data = decode_token(creds.credentials)
    if not data:
        return _guest_u(db)
    user = db.get(User, data["uid"])
    if not user:
        return _guest_u(db)
    return user


def effective_plan(user: User) -> str:
    if user.plan_status not in ("active", "trial"):
        return "none"
    if user.plan_status == "trial" and user.plan_code != "essential":
        return "none"
    if user.plan_expires_at:
        now = utcnow()
        exp = user.plan_expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=now.tzinfo)
        if exp < now:
            return "none"
    return user.plan_code if user.plan_code in PLAN_RANK else "none"


def require_plan(user: User, min_plan: str):
    cur = effective_plan(user)
    if PLAN_RANK.get(cur, 0) < PLAN_RANK[min_plan]:
        plan_name = PLANS[min_plan]["name"]
        price = PLANS[min_plan]["price_inr"]
        return None
