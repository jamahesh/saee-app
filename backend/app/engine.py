from math import sqrt
EASE = {
    "chest": {"slim": 4, "regular": 8, "relaxed": 14, "oversized": 20},
    "waist": {"slim": 2, "regular": 5, "relaxed": 10, "oversized": 16},
    "hips": {"slim": 3, "regular": 7, "relaxed": 12, "oversized": 18},
}
STRETCH = {"none": 1.0, "low": .9, "medium": .75, "high": .6}

def recommend(body, rows, fit="regular", stretch="low"):
    keys = [k for k in ("chest", "waist", "hips", "shoulder", "sleeve", "inseam", "length") if k in body]
    if not keys:
        return {"best_size": None, "alternative_size": None, "confidence": "low",
                "explanation": ["Enter at least one supported body measurement."], "ranked_sizes": []}
    ranked = []
    for row in rows:
        if not row.available:
            continue
        errors, missing = [], []
        for key in keys:
            if key not in row.garment_cm:
                missing.append(key); continue
            target = body[key] + EASE.get(key, {}).get(fit, 0) * STRETCH.get(stretch, .9)
            tolerance = 5 if key in EASE else 3
            errors.append(((row.garment_cm[key] - target) / tolerance) ** 2)
        if errors:
            score = sqrt(sum(errors) / len(errors)) + .15 * len(missing)
            ranked.append({"size": row.size, "score": round(score, 3), "matched": len(errors), "missing": missing})
    ranked.sort(key=lambda x: x["score"])
    if not ranked:
        return {"best_size": None, "alternative_size": None, "confidence": "low",
                "explanation": ["No available chart rows match the supplied measurements."], "ranked_sizes": []}
    best = ranked[0]
    coverage = best["matched"] / len(keys)
    confidence = "high" if coverage >= .8 and best["score"] <= 1 else "medium" if coverage >= .5 and best["score"] <= 2 else "low"
    explanation = [f"Compared {best['matched']} body-to-garment measurement(s).",
                   f"Applied {fit} fit preference and {stretch} fabric stretch.",
                   "This is a mathematical estimate, not a guarantee of fit."]
    if best["missing"]: explanation.append("Chart missing: " + ", ".join(best["missing"]))
    return {"best_size": best["size"], "alternative_size": ranked[1]["size"] if len(ranked)>1 else None,
            "confidence": confidence, "explanation": explanation, "ranked_sizes": ranked}
