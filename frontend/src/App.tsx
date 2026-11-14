import { useEffect, useState } from "react";
import { apiFetch, getToken, setToken } from "./api";
import { AdsAndPlans } from "./components/AdsAndPlans";
import { FitPanel } from "./components/FitPanel";
import { StyleStudio } from "./components/StyleStudio";
import type { PartnerAd, PlanInfo, ProfileData, User, WardrobeItem } from "./types";

type Tab = "fit" | "body" | "occasion" | "plans" | "ads";

const DEFAULT_PROFILE: ProfileData = {
  body_colour: "Medium Wheatish",
  undertone: "Warm",
  height_cm: 172,
  weight_kg: 68,
  chest_cm: 100,
  waist_cm: 88,
  hips_cm: 98,
  shoulder_cm: 44,
  foot_length_cm: 26.5,
  fit_preference: "regular",
  style_vibe: "Modern Tailored",
};

export default function App() {
  const [tab, setTab] = useState<Tab>("fit");
  const [user, setUser] = useState<User | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [geminiReady, setGeminiReady] = useState(false);
  const [ads, setAds] = useState<PartnerAd[]>([]);
  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [banner, setBanner] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const showMessage = (kind: "ok" | "warn" | "err", text: string) => setBanner({ kind, text });

  async function refreshAds() {
    try { setAds((await apiFetch<{ ads: PartnerAd[] }>("/api/ads/active")).ads || []); } catch {}
  }

  async function refreshWardrobe() {
    if (!getToken()) return;
    try {
      const r = await apiFetch<{ items?: WardrobeItem[] } | WardrobeItem[]>("/api/wardrobe");
      setWardrobe(Array.isArray(r) ? r : r.items || []);
    } catch {}
  }

  async function loadUserContext() {
    if (!getToken()) return;
    try {
      const me = await apiFetch<{ user: User }>("/api/auth/me");
      setUser(me.user);
      if (me.user?.plan_active) {
        try {
          const r = await apiFetch<{ profile?: ProfileData } & Partial<ProfileData>>("/api/profile");
          const p = r.profile || r;
          if (p?.body_colour) setProfile({ ...DEFAULT_PROFILE, ...p });
        } catch {}
        await refreshWardrobe();
      }
    } catch {
      setToken("");
      setUser(null);
    }
  }

  useEffect(() => {
    apiFetch<{ razorpay_ready: boolean; gemini_ready: boolean; plans: PlanInfo[] }>("/api/plans")
      .then((d) => { setPlans(d.plans || []); setRazorpayReady(Boolean(d.razorpay_ready)); setGeminiReady(Boolean(d.gemini_ready)); })
      .catch(() => showMessage("err", "SAEE backend unavailable on port 8001."));
    void refreshAds();
    void loadUserContext();
  }, []);

  async function handleAdClick(ad: PartnerAd) {
    try {
      await apiFetch(`/api/ads/${ad.id}/click`, { method: "POST" });
      await refreshAds();
      showMessage("ok", `Tracked click for ${ad.brand_name}: ${ad.offer_text}`);
    } catch {}
  }

  function signOut() {
    setToken("");
    setUser(null);
    setWardrobe([]);
    setProfile(DEFAULT_PROFILE);
    showMessage("ok", "Signed out of SAEE.");
  }

  const hasPlan = Boolean(user?.plan_active);
  const isAdFree = Boolean(hasPlan && user?.plan_code === "studio");

  return (
    <div className="saee-shell">
      <header className="saee-header">
        <div className="brand-mark">
          <h1 className="brand-logo">SAEE</h1>
          <span className="brand-tag">Your Style. Your Intelligence.</span>
        </div>
        <div className="account-bar">
          {user ? (
            <>
              <span className={`plan-badge ${hasPlan ? "active" : ""}`}>
                {user.name} &middot; {hasPlan ? `${String(user.plan_code).toUpperCase()}${user.plan_status === "trial" ? " (7-DAY TRIAL)" : ""}` : "NO ACTIVE PLAN"}
              </span>
              <button type="button" className="btn-secondary" onClick={signOut}>Sign Out</button>
            </>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setTab("plans")}>Sign In / Plans (From ₹99/mo)</button>
          )}
        </div>
      </header>

      <nav className="nav-tabs">
        {([["fit", "Fit & Footwear"], ["body", "Body & Colour + Photo"], ["occasion", "Occasion AI & Wardrobe"], ["plans", "Plans (₹99 - ₹499)"], ["ads", "Partner Brand Ads"]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" className={`tab-btn ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {banner && (
        <div className={`notice ${banner.kind}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span>{banner.text}</span>
          <button type="button" className="btn-secondary" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      {!hasPlan && tab !== "plans" && (
        <div className="notice warn" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span><strong>Plan Required:</strong> Without buying a plan (or activating the 1-time 7-Day Essential Free Trial), SAEE services are locked.</span>
          <button type="button" className="btn-primary" onClick={() => setTab("plans")}>Buy Plan / Start Trial</button>
        </div>
      )}

      {tab === "fit" && <FitPanel user={user} profile={profile} onMessage={showMessage} onGoPlans={() => setTab("plans")} />}
      {(tab === "body" || tab === "occasion") && (
        <StyleStudio mode={tab} user={user} profile={profile} wardrobe={wardrobe} onProfileChange={setProfile} onWardrobeRefresh={refreshWardrobe} onMessage={showMessage} onGoPlans={() => setTab("plans")} />
      )}
      {(tab === "plans" || tab === "ads") && (
        <AdsAndPlans mode={tab} user={user} plans={plans} razorpayReady={razorpayReady} geminiReady={geminiReady} ads={ads} onAuthChange={(u) => { setUser(u); if (u) void loadUserContext(); }} onRefreshAds={refreshAds} onMessage={showMessage} />
      )}

      {!isAdFree && ads.length > 0 && (
        <section className="ad-strip" id="partners">
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <strong>Curated Partner Brands (Ad-Supported Tier)</strong>
            <span className="muted">Upgrade to Studio Family (₹499/mo) for ad-free mode</span>
          </div>
          <div className="ad-cards">
            {ads.slice(0, 3).map((ad) => (
              <div key={ad.id} className="ad-card">
                <div>
                  <div className="ad-tag">{ad.category} &middot; {ad.target_occasion}</div>
                  <strong>{ad.brand_name}</strong>
                  <div>{ad.headline}</div>
                  <div className="muted">{ad.offer_text}</div>
                </div>
                <button type="button" className="btn-secondary" onClick={() => handleAdClick(ad)}>Explore Offer ({ad.clicks} clicks)</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {isAdFree && <div className="notice ok" style={{ marginTop: 22 }}>Studio Family (₹499/mo) Ad-Free Editorial Mode Active.</div>}
    </div>
  );
}
