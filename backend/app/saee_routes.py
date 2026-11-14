from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import PartnerAd, StyleHistory, StyleProfile, User, WardrobeItem, utcnow
from .saee_services import (
    analyze_skin_palette,
    calculate_footwear_size,
    generate_ai_style,
    generate_photo_answer,
)
from .security import get_current_user, require_plan

router = APIRouter()


class ProfileInput(BaseModel):
    body_colour: str = "Medium Warm"
    undertone: str = "warm"
    height_cm: float = Field(gt=50, le=250)
    weight_kg: float = Field(gt=20, le=250)
    chest_cm: float = Field(gt=40, le=200)
    waist_cm: float = Field(gt=40, le=200)
    hips_cm: float = Field(gt=40, le=200)
    shoulder_cm: float = Field(gt=25, le=90)
    foot_length_cm: float = Field(gt=12, le=40)
    fit_preference: str = "regular"
    style_vibe: str = "contemporary"


class FootwearInput(BaseModel):
    foot_length_cm: float = Field(gt=12, le=40)
    width: str = "standard"
    category: str = "sneakers"


class OccasionStyleInput(BaseModel):
    occasion: str = Field(min_length=2, max_length=80)
    notes: str = ""
    image_base64: str | None = None
    mime_type: str | None = None


class PhotoStyleInput(BaseModel):
    image_base64: str = Field(min_length=20)
    mime_type: str = "image/jpeg"
    occasion: str = "Personal Style Check"
    question: str = ""


class CoupleStyleInput(BaseModel):
    occasion: str = "Date Night / Reception"
    partner_body_colour: str = "Fair Neutral"
    partner_undertone: str = "neutral"
    partner_height_cm: float = 165.0
    partner_chest_cm: float = 90.0
    partner_fit: str = "regular"
    notes: str = ""


class FamilyMember(BaseModel):
    label: str = Field(min_length=2, max_length=50)
    body_colour: str = "Medium"
    undertone: str = "warm"
    preferred_fit: str = "regular"


class FamilyStyleInput(BaseModel):
    occasion: str = "Family Celebration"
    members: list[FamilyMember] = Field(min_length=2, max_length=6)
    notes: str = ""


class WardrobeInput(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    category: str = Field(min_length=2, max_length=60)
    color: str = Field(min_length=2, max_length=60)
    occasion: str = Field(min_length=2, max_length=60)
    size_label: str = "M"
    notes: str = ""


class PartnerAdInput(BaseModel):
    brand_name: str = Field(min_length=2, max_length=120)
    headline: str = Field(min_length=4, max_length=180)
    offer_text: str = Field(min_length=4, max_length=240)
    category: str = "Fashion"
    target_occasion: str = "all"
    cta_url: str = "https://saee-fashion.web.app"
    monthly_budget_inr: int = Field(ge=1000, le=500000)


def _profile_dict(p: StyleProfile | None) -> dict:
    if not p:
        return {
            "body_colour": "Medium Warm",
            "undertone": "warm",
            "height_cm": 170.0,
            "weight_kg": 65.0,
            "chest_cm": 96.0,
            "waist_cm": 82.0,
            "hips_cm": 96.0,
            "shoulder_cm": 44.0,
            "foot_length_cm": 26.0,
            "fit_preference": "regular",
            "style_vibe": "contemporary",
        }
    return {
        "body_colour": p.body_colour,
        "undertone": p.undertone,
        "height_cm": p.height_cm,
        "weight_kg": p.weight_kg,
        "chest_cm": p.chest_cm,
        "waist_cm": p.waist_cm,
        "hips_cm": p.hips_cm,
        "shoulder_cm": p.shoulder_cm,
        "foot_length_cm": p.foot_length_cm,
        "fit_preference": p.fit_preference,
        "style_vibe": p.style_vibe,
    }


def _get_prof(db: Session, user_id: int) -> dict:
    return _profile_dict(db.scalar(select(StyleProfile).where(StyleProfile.user_id == user_id)))


@router.get("/api/profile")
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_plan(user, "essential")
    return {"profile": _get_prof(db, user.id)}


@router.put("/api/profile")
def save_profile(payload: ProfileInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_plan(user, "essential")
    p = db.scalar(select(StyleProfile).where(StyleProfile.user_id == user.id))
    if not p:
        p = StyleProfile(user_id=user.id)
        db.add(p)
    for k, v in payload.model_dump().items():
        setattr(p, k, v)
    p.updated_at = utcnow()
    db.commit()
    db.refresh(p)
    return {"profile": _profile_dict(p), "palette": analyze_skin_palette(p.body_colour, p.undertone)}


@router.post("/api/footwear/recommend")
def footwear_recommend(payload: FootwearInput, user: User = Depends(get_current_user)):
    require_plan(user, "essential")
    return calculate_footwear_size(payload.foot_length_cm, payload.width, payload.category)


@router.get("/api/style/colour")
def colour_analysis(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_plan(user, "essential")
    prof = _get_prof(db, user.id)
    return analyze_skin_palette(prof["body_colour"], prof["undertone"])


@router.post("/api/style/photo")
async def style_photo(payload: PhotoStyleInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_plan(user, "essential")
    if len(payload.image_base64) > 5_000_000:
        raise HTTPException(400, "Photo too large (max 5 MB).")
    prof = _get_prof(db, user.id)
    try:
        result = await generate_photo_answer(prof, payload.image_base64, payload.mime_type, payload.occasion, payload.question)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    db.add(StyleHistory(user_id=user.id, section="photo", occasion=payload.occasion, result_json=result, used_gemini=bool(result.get("used_gemini"))))
    db.commit()
    return result


@router.post("/api/style/occasion")
async def style_occasion(payload: OccasionStyleInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_plan(user, "professional")
    if payload.image_base64 and len(payload.image_base64) > 5_000_000:
        raise HTTPException(400, "Photo too large (max 5 MB).")
    prof = _get_prof(db, user.id)
    result = await generate_ai_style(
        "occasion",
        prof,
        payload.occasion,
        {"notes": payload.notes},
        image_base64=payload.image_base64,
        mime_type=payload.mime_type,
    )
    db.add(StyleHistory(user_id=user.id, section="occasion", occasion=payload.occasion, result_json=result, used_gemini=bool(result.get("used_gemini"))))
    db.commit()
    return result


@router.post("/api/style/couple")
async def style_couple(payload: CoupleStyleInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_plan(user, "professional")
    prof = _get_prof(db, user.id)
    result = await generate_ai_style("couple", prof, f"Couple Matching - {payload.occasion}", payload.model_dump())
    db.add(StyleHistory(user_id=user.id, section="couple", occasion=payload.occasion, result_json=result, used_gemini=bool(result.get("used_gemini"))))
    db.commit()
    return result


@router.post("/api/style/family")
async def style_family(payload: FamilyStyleInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_plan(user, "studio")
    prof = _get_prof(db, user.id)
    result = await generate_ai_style("family", prof, f"Family Section - {payload.occasion}", payload.model_dump())
    db.add(StyleHistory(user_id=user.id, section="family", occasion=payload.occasion, result_json=result, used_gemini=bool(result.get("used_gemini"))))
    db.commit()
    return result


@router.get("/api/wardrobe")
def list_wardrobe(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_plan(user, "professional")
    items = db.scalars(select(WardrobeItem).where(WardrobeItem.user_id == user.id).order_by(WardrobeItem.id.desc())).all()
    return {
        "items": [
            {
                "id": i.id,
                "title": i.title,
                "category": i.category,
                "color": i.color,
                "occasion": i.occasion,
                "size_label": i.size_label,
                "notes": i.notes,
            }
            for i in items
        ]
    }


@router.post("/api/wardrobe")
def add_wardrobe(payload: WardrobeInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_plan(user, "professional")
    item = WardrobeItem(user_id=user.id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, **payload.model_dump()}


@router.delete("/api/wardrobe/{item_id}")
def delete_wardrobe(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_plan(user, "professional")
    item = db.get(WardrobeItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Wardrobe item not found")
    db.delete(item)
    db.commit()
    return {"deleted": True}


@router.get("/api/ads/active")
def get_active_ads(occasion: str = "all", db: Session = Depends(get_db)):
    ads = db.scalars(select(PartnerAd).where(PartnerAd.active.is_(True)).order_by(PartnerAd.id.desc())).all()
    if occasion != "all":
        matched = [a for a in ads if a.target_occasion.lower() in ("all", occasion.lower())]
        if matched:
            ads = matched
    for a in ads[:6]:
        a.impressions += 1
    db.commit()
    return {
        "ads": [
            {
                "id": a.id,
                "brand_name": a.brand_name,
                "headline": a.headline,
                "offer_text": a.offer_text,
                "category": a.category,
                "target_occasion": a.target_occasion,
                "cta_url": a.cta_url,
                "impressions": a.impressions,
                "clicks": a.clicks,
                "monthly_budget_inr": a.monthly_budget_inr,
            }
            for a in ads[:6]
        ]
    }


@router.post("/api/ads/{ad_id}/click")
def track_ad_click(ad_id: int, db: Session = Depends(get_db)):
    ad = db.get(PartnerAd, ad_id)
    if not ad:
        raise HTTPException(404, "Ad not found")
    ad.clicks += 1
    db.commit()
    return {"clicks": ad.clicks}


@router.post("/api/ads")
def create_partner_ad(payload: PartnerAdInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "owner":
        require_plan(user, "studio")
    ad = PartnerAd(**payload.model_dump())
    db.add(ad)
    db.commit()
    db.refresh(ad)
    return {"id": ad.id, "brand_name": ad.brand_name, "active": ad.active}
