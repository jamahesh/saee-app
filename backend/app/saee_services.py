import hashlib
import hmac
import json
import os
import httpx

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()

ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


def _clean_image_payload(image_base64: str | None, mime_type: str | None) -> tuple[str, str]:
    if not image_base64:
        return "", "image/jpeg"
    raw = image_base64.strip()
    detected_mime = (mime_type or "image/jpeg").strip().lower()
    if raw.startswith("data:") and "," in raw:
        header, raw = raw.split(",", 1)
        if ";" in header:
            detected_mime = header[5:].split(";", 1)[0].strip().lower()
    if detected_mime == "image/jpg":
        detected_mime = "image/jpeg"
    if detected_mime not in ALLOWED_IMAGE_MIMES:
        detected_mime = "image/jpeg"
    return raw.strip(), detected_mime


def calculate_footwear_size(foot_length_cm: float, width: str = "standard", category: str = "sneakers") -> dict:
    adj = 0.5 if width == "wide" else (-0.2 if width == "narrow" else 0.0)
    effective_cm = round(foot_length_cm + adj + (0.3 if category in ("running", "boots") else 0.0), 1)
    eu = round((effective_cm + 1.5) * 1.5)
    uk = round((effective_cm * 3 / 2.54) - 23.0, 1)
    uk_clean = round(uk * 2) / 2
    us_m = round(uk_clean + 1.0, 1)
    us_w = round(uk_clean + 2.0, 1)
    return {
        "foot_length_cm": foot_length_cm,
        "effective_cm": effective_cm,
        "india_uk": f"UK/IN {uk_clean:g}",
        "eu": f"EU {eu}",
        "us_men": f"US {us_m:g}",
        "us_women": f"US {us_w:g}",
        "fit_note": f"Calculated for {width} width in {category}. Measure both feet standing and add 0.5 cm toe room.",
    }


def analyze_skin_palette(body_colour: str, undertone: str) -> dict:
    u = (undertone or "warm").lower()
    palettes = {
        "warm": {
            "best_colours": ["Olive Moss", "Terracotta Rust", "Warm Ivory", "Mustard Ochre", "Espresso Brown"],
            "avoid": ["Icy Neon Pink", "Stark Cool Blue-Grey"],
            "metals": ["Brushed Gold", "Antique Brass", "Copper"],
            "fabrics": ["Raw Linen", "Cotton Twill", "Silk Chanderi"],
        },
        "cool": {
            "best_colours": ["Emerald Pine", "Cobalt Navy", "Crisp Alabaster", "Plum Berry", "Charcoal Slate"],
            "avoid": ["Orange-Yellow", "Muddy Camel"],
            "metals": ["Sterling Silver", "Platinum", "White Gold"],
            "fabrics": ["Combed Poplin", "Merino Knit", "Satin Crepe"],
        },
        "neutral": {
            "best_colours": ["Sage Celadon", "Warm Taupe", "Midnight Teal", "Soft Rosewood", "Bone Cream"],
            "avoid": ["Overly Fluorescent Shades"],
            "metals": ["Champagne Gold", "Rose Gold", "Matte Silver"],
            "fabrics": ["Tencel", "Fine Gabardine", "Cotton-Silk Blend"],
        },
    }
    chosen = palettes.get(u, palettes["neutral"])
    return {
        "body_colour": body_colour,
        "undertone": u.title(),
        **chosen,
    }


def _fallback_occasion_style(profile: dict, occasion: str, notes: str, has_photo: bool = False) -> dict:
    palette = analyze_skin_palette(profile.get("body_colour", "Medium"), profile.get("undertone", "warm"))
    occ = occasion.lower()
    chest = float(profile.get("chest_cm", 96))
    size = "S" if chest < 92 else "M" if chest < 100 else "L" if chest < 108 else "XL"
    foot = calculate_footwear_size(float(profile.get("foot_length_cm", 26.0)))
    guides = {
        "birthday": (
            f"Tailored {palette['best_colours'][0]} structured overshirt or drape dress paired with tapered trousers.",
            "Statement minimal watch + clean leather loafers/heels.",
        ),
        "college": (
            f"Breathable relaxed {palette['best_colours'][2]} tee layered under an open utility jacket with straight denim.",
            "Canvas or minimalist retro sneakers + canvas tote.",
        ),
        "school": (
            f"Neat crisp {palette['best_colours'][2]} collared shirt/polo with well-fitted chinos or pleated skirt.",
            "Clean supportive everyday shoes + understated strap watch.",
        ),
        "couple": (
            f"Coordinated tonal pairing in {palette['best_colours'][0]} & {palette['best_colours'][2]} without looking identical.",
            f"Match hardware in {palette['metals'][0]} and complementary footwear tones.",
        ),
        "family": (
            f"Three-tone family capsule built around {palette['best_colours'][2]}, {palette['best_colours'][0]}, and {palette['best_colours'][4]}.",
            "Vary textures (linen, cotton knit, silk blend) while keeping one shared accent shade.",
        ),
    }
    key = "birthday" if "birth" in occ else "college" if "coll" in occ else "school" if "sch" in occ else "couple" if "coup" in occ else "family" if "fam" in occ else "birthday"
    outfit, acc = guides[key]
    photo_note = " Photo attached cleanly (enable GEMINI_API_KEY in backend/.env for live vision critique)." if has_photo else ""
    return {
        "occasion": occasion,
        "recommended_size": size,
        "footwear": foot["india_uk"] + " / " + foot["eu"],
        "headline_look": outfit,
        "colour_story": palette["best_colours"][:3],
        "accessories": acc,
        "fit_notes": f"Tailored for height {profile.get('height_cm', 170)} cm, chest {chest} cm, {profile.get('fit_preference', 'regular')} fit. {notes}{photo_note}".strip(),
        "used_gemini": False,
        "photo_included": has_photo,
    }


async def generate_ai_style(
    section: str,
    profile: dict,
    occasion: str,
    extra: dict,
    image_base64: str | None = None,
    mime_type: str | None = None,
) -> dict:
    clean_b64, clean_mime = _clean_image_payload(image_base64, mime_type)
    has_photo = bool(clean_b64)
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return _fallback_occasion_style(profile, occasion, extra.get("notes", ""), has_photo=has_photo)

    prompt = (
        "You are SAEE, an international luxury AI personal stylist. "
        "Return ONLY valid JSON with keys: headline_look (string), recommended_size (string), "
        "footwear (string), colour_story (array of 3 color names), accessories (string), fit_notes (string). "
        f"Section: {section}. Occasion: {occasion}. "
        f"Saved body profile: {json.dumps(profile)}. Extra context: {json.dumps(extra)}."
    )
    if has_photo:
        prompt += " Inspect the attached user/outfit photo closely for garment fit, drape, colour harmony, and styling refinements."

    parts = [{"text": prompt}]
    if has_photo:
        parts.insert(0, {"inline_data": {"mime_type": clean_mime, "data": clean_b64}})

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    try:
        async with httpx.AsyncClient(timeout=22.0) as client:
            res = await client.post(
                url,
                json={
                    "contents": [{"parts": parts}],
                    "generationConfig": {"responseMimeType": "application/json"},
                },
            )
        if res.status_code != 200:
            return _fallback_occasion_style(profile, occasion, extra.get("notes", ""), has_photo=has_photo)
        data = res.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
        parsed["occasion"] = occasion
        parsed["used_gemini"] = True
        parsed["photo_included"] = has_photo
        return parsed
    except Exception:
        return _fallback_occasion_style(profile, occasion, extra.get("notes", ""), has_photo=has_photo)


def _fallback_photo_answer(profile: dict, occasion: str, question: str) -> dict:
    palette = analyze_skin_palette(profile.get("body_colour", "Medium"), profile.get("undertone", "warm"))
    chest = float(profile.get("chest_cm", 96))
    size = "S" if chest < 92 else "M" if chest < 100 else "L" if chest < 108 else "XL"
    q_line = f"Regarding your question ('{question.strip()}'): " if question.strip() else ""
    return {
        "occasion": occasion,
        "photo_received": True,
        "photo_summary": (
            f"{q_line}Your uploaded look is paired against your saved SAEE profile "
            f"({profile.get('height_cm', 170)} cm, {profile.get('body_colour', 'Medium Warm')}, "
            f"{profile.get('undertone', 'warm')} undertone). Add GEMINI_API_KEY in backend/.env to unlock live pixel-level photo vision."
        ),
        "fit_feedback": f"Recommended baseline size {size} ({profile.get('fit_preference', 'regular')} fit) with clean shoulder alignment at {profile.get('shoulder_cm', 44)} cm.",
        "colour_harmony": f"Best flattering tones for you: {', '.join(palette['best_colours'][:3])}. Metals: {', '.join(palette['metals'][:2])}.",
        "recommended_size": size,
        "improvements": [
            f"Anchor the outfit with {palette['best_colours'][0]} or {palette['best_colours'][2]} near your face.",
            f"Choose {palette['fabrics'][0]} / {palette['fabrics'][1]} for crisp structure.",
            "Balance proportions with clean footwear matched to your SAEE foot length.",
        ],
        "outfit_pairing": f"Pair with {palette['best_colours'][1]} accents and {palette['metals'][0]} hardware for {occasion}.",
        "used_gemini": False,
    }


async def generate_photo_answer(
    profile: dict,
    image_base64: str,
    mime_type: str = "image/jpeg",
    occasion: str = "Personal Style Check",
    question: str = "",
) -> dict:
    clean_b64, clean_mime = _clean_image_payload(image_base64, mime_type)
    if not clean_b64:
        raise ValueError("Please upload a valid photo.")
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return _fallback_photo_answer(profile, occasion, question)

    prompt = (
        "You are SAEE, an international luxury AI personal stylist and fit expert. "
        "Analyze the uploaded photo alongside the user's saved body & skin-tone profile. "
        "Return ONLY valid JSON with keys: "
        "photo_summary (string), fit_feedback (string), colour_harmony (string), "
        "recommended_size (string), improvements (array of 3 concise actionable tips), outfit_pairing (string). "
        f"Occasion: {occasion}. User question: {question or 'Please evaluate fit, colour match, and overall styling.'}. "
        f"Saved profile: {json.dumps(profile)}."
    )
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    try:
        async with httpx.AsyncClient(timeout=24.0) as client:
            res = await client.post(
                url,
                json={
                    "contents": [
                        {
                            "parts": [
                                {"inline_data": {"mime_type": clean_mime, "data": clean_b64}},
                                {"text": prompt},
                            ]
                        }
                    ],
                    "generationConfig": {"responseMimeType": "application/json"},
                },
            )
        if res.status_code != 200:
            return _fallback_photo_answer(profile, occasion, question)
        data = res.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
        parsed["occasion"] = occasion
        parsed["photo_received"] = True
        parsed["used_gemini"] = True
        return parsed
    except Exception:
        return _fallback_photo_answer(profile, occasion, question)


async def create_razorpay_order(amount_inr: int, receipt: str, notes: dict) -> dict:
    key_id = os.getenv("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    if not key_id or not key_secret:
        raise RuntimeError(
            "Razorpay API keys are not configured yet. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env."
        )
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(
            "https://api.razorpay.com/v1/orders",
            auth=(key_id, key_secret),
            json={
                "amount": amount_inr * 100,
                "currency": "INR",
                "receipt": receipt,
                "notes": notes,
            },
        )
    if res.status_code not in (200, 201):
        raise RuntimeError(f"Razorpay order creation failed: {res.text}")
    order = res.json()
    return {"order_id": order["id"], "amount": order["amount"], "currency": order["currency"], "key_id": key_id}


def verify_razorpay_signature(order_id: str, payment_id: str, signature: str) -> bool:
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    if not key_secret:
        return False
    msg = f"{order_id}|{payment_id}".encode("utf-8")
    expected = hmac.new(key_secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_razorpay_webhook(raw_body: bytes, signature: str) -> bool:
    secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
