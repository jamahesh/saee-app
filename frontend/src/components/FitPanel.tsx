import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import type { ProfileData, SizeResult, User } from "../types";

type Props = {
  user: User | null;
  profile: ProfileData;
  onMessage: (kind: "ok" | "warn" | "err", text: string) => void;
  onGoPlans: () => void;
};

export function FitPanel({ user, profile, onMessage, onGoPlans }: Props) {
  const hasPlan = Boolean(user?.plan_active);
  const [chest, setChest] = useState(String(profile.chest_cm || 100));
  const [waist, setWaist] = useState(String(profile.waist_cm || 88));
  const [fitPref, setFitPref] = useState(profile.fit_preference || "regular");
  const [sizeRes, setSizeRes] = useState<SizeResult | null>(null);
  const [footLen, setFootLen] = useState(String(profile.foot_length_cm || 26.5));
  const [footWidth, setFootWidth] = useState("regular");
  const [footCategory, setFootCategory] = useState("sneakers");
  const [footRes, setFootRes] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setChest(String(profile.chest_cm || 100));
    setWaist(String(profile.waist_cm || 88));
    setFitPref(profile.fit_preference || "regular");
    setFootLen(String(profile.foot_length_cm || 26.5));
  }, [profile.chest_cm, profile.waist_cm, profile.fit_preference, profile.foot_length_cm]);

  function needPlan(): boolean {
    if (!user || !hasPlan) {
      onMessage("warn", "SAEE services are locked. Buy a plan or start the 7-day Essential trial.");
      onGoPlans();
      return true;
    }
    return false;
  }

  function handleErr(err: unknown, fallback: string) {
    const msg = err instanceof Error ? err.message : fallback;
    onMessage("err", msg);
    if (msg.toLowerCase().includes("plan") || msg.includes("403")) onGoPlans();
  }

  async function calculateClothingSize(e: React.FormEvent) {
    e.preventDefault();
    if (needPlan()) return;
    setBusy(true);
    setSizeRes(null);
    try {
      const seed = await apiFetch<{ product_id: number }>("/api/demo/seed");
      const rec = await apiFetch<SizeResult>(`/api/products/${seed.product_id}/recommend`, {
        method: "POST",
        body: JSON.stringify({
          measurements_cm: { chest: Number(chest), waist: Number(waist) },
          fit_preference: fitPref,
        }),
      });
      setSizeRes(rec);
    } catch (err) {
      handleErr(err, "Could not calculate clothing size.");
    } finally {
      setBusy(false);
    }
  }

  async function calculateFootwear(e: React.FormEvent) {
    e.preventDefault();
    if (needPlan()) return;
    setBusy(true);
    setFootRes(null);
    try {
      const res = await apiFetch<Record<string, unknown>>("/api/footwear/recommend", {
        method: "POST",
        body: JSON.stringify({
          foot_length_cm: Number(footLen),
          width: footWidth,
          category: footCategory,
        }),
      });
      setFootRes(res);
    } catch (err) {
      handleErr(err, "Footwear sizing requires Essential (₹99/mo)+ or trial.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Clothing Size Engine (Essential ₹99/mo+)</h2>
        <p className="muted">Verified multi-measurement garment sizing preserved from Universal Fit.</p>
        <form onSubmit={calculateClothingSize}>
          <div className="form-grid">
            <div className="field">
              <label>Chest (cm)</label>
              <input type="number" value={chest} onChange={(e) => setChest(e.target.value)} required />
            </div>
            <div className="field">
              <label>Waist (cm)</label>
              <input type="number" value={waist} onChange={(e) => setWaist(e.target.value)} required />
            </div>
          </div>
          <div className="field">
            <label>Fit Preference</label>
            <select value={fitPref} onChange={(e) => setFitPref(e.target.value)}>
              <option value="slim">Slim</option>
              <option value="regular">Regular</option>
              <option value="relaxed">Relaxed</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" className="btn-primary" disabled={busy || !hasPlan}>
              {hasPlan ? "Calculate Clothing Size" : "Locked — Buy Plan or Start Trial"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={!hasPlan}
              onClick={() => {
                setChest(String(profile.chest_cm));
                setWaist(String(profile.waist_cm));
                setFitPref(profile.fit_preference);
              }}
            >
              Use Saved Profile
            </button>
          </div>
        </form>
        {sizeRes && (
          <div className="result-box">
            <div className="big-size">Size {sizeRes.best_size || "N/A"}</div>
            <div className="muted">
              Alternative: {sizeRes.alternative_size || "None"} &middot; Confidence: {sizeRes.confidence}
            </div>
            {sizeRes.warning && <div className="notice warn">{sizeRes.warning}</div>}
            <ul className="feature-list">
              {sizeRes.explanation.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Footwear Size Calculator (Essential ₹99/mo+)</h2>
        <p className="muted">Convert exact foot length in cm into EU, UK, US &amp; India footwear sizes.</p>
        <form onSubmit={calculateFootwear}>
          <div className="form-grid">
            <div className="field">
              <label>Foot Length (cm)</label>
              <input type="number" step="0.1" value={footLen} onChange={(e) => setFootLen(e.target.value)} required />
            </div>
            <div className="field">
              <label>Foot Width</label>
              <select value={footWidth} onChange={(e) => setFootWidth(e.target.value)}>
                <option value="narrow">Narrow</option>
                <option value="regular">Regular</option>
                <option value="wide">Wide</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Footwear Type</label>
            <select value={footCategory} onChange={(e) => setFootCategory(e.target.value)}>
              <option value="sneakers">Sneakers</option>
              <option value="loafers">Formal Loafers</option>
              <option value="running">Running Shoes</option>
              <option value="heels_sandals">Sandals / Ethnic Footwear</option>
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={busy || !hasPlan}>
            {hasPlan ? "Calculate Footwear Size" : "Locked — Buy Plan or Start Trial"}
          </button>
        </form>
        {footRes && (
          <div className="result-box">
            {Object.entries(footRes).map(([k, v]) => (
              <div key={k} style={{ marginBottom: 4 }}>
                <strong>{k.replace(/_/g, " ").toUpperCase()}:</strong> {String(v)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
