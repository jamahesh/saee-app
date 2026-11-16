import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { AdsAndPlans } from "./components/AdsAndPlans";
import { FitPanel } from "./components/FitPanel";
import { StyleStudio } from "./components/StyleStudio";
import type { PartnerAd, PlanInfo, ProfileData, User, WardrobeItem } from "./types";

type Tab = "fit" | "body" | "occasion" | "ads";

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
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("saee_theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [user, setUser] = useState<User | null>({id:0,email:"guest@saee.app",name:"SAEE Guest",role:"owner",plan_code:"studio",plan_status:"active",plan_active:true} as unknown as User);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [geminiReady, setGeminiReady] = useState(false);
  const [ads, setAds] = useState<PartnerAd[]>([]);
  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [banner, setBanner] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const showMessage = (kind: "ok" | "warn" | "err", text: string) => setBanner({ kind, text });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("saee_theme", theme);
  }, [theme]);

  async function refreshAds() {
    try { setAds((await apiFetch<{ ads: PartnerAd[] }>("/api/ads/active")).ads || []); } catch {}
  }

  async function refreshWardrobe() {
    try {
      const r = await apiFetch<{ items?: WardrobeItem[] } | WardrobeItem[]>("/api/wardrobe");
      setWardrobe(Array.isArray(r) ? r : r.items || []);
    } catch {}
  }

  async function loadUserContext() {
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
    } catch {}
  }

  useEffect(() => {
    apiFetch<{ razorpay_ready: boolean; gemini_ready: boolean; plans: PlanInfo[] }>("/api/plans")
      .then((d) => { setPlans(d.plans || []); setRazorpayReady(Boolean(d.razorpay_ready)); setGeminiReady(Boolean(d.gemini_ready)); })
      .catch(() => showMessage("warn", "SAEE server is waking up (~30s on free plan) — please refresh in a moment."));
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
  const isAdFree = false;

  return (
    <div className="saee-shell">
      <header className="saee-header">
        <div className="brand-mark">
          <h1 className="brand-logo">SAEE</h1>
          <span className="brand-tag">Your Style. Your Intelligence.</span>
        </div>
        <div className="account-bar">
          <button type="button" className="btn-secondary" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>{theme === "dark" ? "Light Mode" : "Dark Mode"}</button>
          <span className="plan-badge active">ALL SERVICES OPEN</span>
        </div>
      </header>

      <nav className="nav-tabs">
        {([["fit", "Fit & Footwear"], ["body", "Body & Colour + Photo"], ["occasion", "Occasion AI & Wardrobe"], ["ads", "Partner Brand Ads"]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" className={`tab-btn ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {banner && (
        <div className={`notice ${banner.kind}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span>{banner.text}</span>
          <button type="button" className="btn-secondary" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      

      {tab === "fit" && <FitPanel user={user} profile={profile} onMessage={showMessage} onGoPlans={() => setTab("fit")} />}
      {(tab === "body" || tab === "occasion") && (
        <StyleStudio mode={tab} user={user} profile={profile} wardrobe={wardrobe} onProfileChange={setProfile} onWardrobeRefresh={refreshWardrobe} onMessage={showMessage} onGoPlans={() => setTab("fit")} />
      )}
      {tab === "ads" && (
        <AdsAndPlans mode="ads" user={user} plans={plans} razorpayReady={razorpayReady} geminiReady={geminiReady} ads={ads} onAuthChange={(u) => { setUser(u); if (u) void loadUserContext(); }} onRefreshAds={refreshAds} onMessage={showMessage} />
      )}

      {!isAdFree && ads.length > 0 && (
        <section className="ad-strip" id="partners">
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <strong>Curated Partner Brands (Ad-Supported Tier)</strong>
            <span className="muted">Explore featured partner offers</span>
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
