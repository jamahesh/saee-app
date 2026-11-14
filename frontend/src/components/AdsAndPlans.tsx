import { useState } from "react";
import { apiFetch, setToken } from "../api";
import type { PartnerAd, PlanInfo, User } from "../types";

type Props = {
  mode: "plans" | "ads";
  user: User | null;
  plans: PlanInfo[];
  razorpayReady: boolean;
  geminiReady: boolean;
  ads: PartnerAd[];
  onAuthChange: (u: User | null) => void;
  onRefreshAds: () => void;
  onMessage: (kind: "ok" | "warn" | "err", text: string) => void;
};

export function AdsAndPlans({
  mode,
  user,
  plans,
  razorpayReady,
  geminiReady,
  ads,
  onAuthChange,
  onRefreshAds,
  onMessage,
}: Props) {
  const [authTab, setAuthTab] = useState<"register" | "login">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const [brandName, setBrandName] = useState("");
  const [headline, setHeadline] = useState("");
  const [offerText, setOfferText] = useState("");
  const [category, setCategory] = useState("Occasionwear");
  const [targetOccasion, setTargetOccasion] = useState("Birthday");
  const [ctaUrl, setCtaUrl] = useState("https://saee-fashion.web.app");
  const [budgetInr, setBudgetInr] = useState("10000");

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const endpoint = authTab === "register" ? "/api/auth/register" : "/api/auth/login";
      const body = authTab === "register" ? { name, email, password } : { email, password };
      const res = await apiFetch<{ token?: string; access_token?: string; user: User }>(
        endpoint,
        { method: "POST", body: JSON.stringify(body) }
      );
      setToken(res.token || res.access_token || "");
      onAuthChange(res.user);
      onMessage("ok", `Welcome to SAEE, ${res.user.name}! Start your 7-day Essential trial or buy a plan below.`);
    } catch (err) {
      onMessage("err", err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function startEssentialTrial() {
    if (!user) {
      onMessage("warn", "Please create an account or sign in first to start your 7-day Essential trial.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ user: User; message: string }>("/api/plans/start-trial", {
        method: "POST",
        body: JSON.stringify({ plan_code: "essential" }),
      });
      onAuthChange(res.user);
      onMessage("ok", res.message);
    } catch (err) {
      onMessage("err", err instanceof Error ? err.message : "Unable to start 7-day trial.");
    } finally {
      setBusy(false);
    }
  }

  async function startCheckout(plan: PlanInfo) {
    if (!user) {
      onMessage("warn", "Please create an account or sign in first before buying a plan.");
      return;
    }
    setBusy(true);
    try {
      const order = await apiFetch<{
        order_id: string;
        amount?: number;
        amount_paise?: number;
        currency: string;
        key_id: string;
      }>("/api/payments/create-order", {
        method: "POST",
        body: JSON.stringify({ plan_code: plan.code }),
      });
      if (!window.Razorpay) {
        throw new Error("Razorpay Checkout script did not load. Check internet connection.");
      }
      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount ?? order.amount_paise ?? plan.price_inr * 100,
        currency: order.currency || "INR",
        name: "SAEE Fashion Intelligence",
        description: `${plan.name} Monthly Subscription (INR ${plan.price_inr}/mo)`,
        order_id: order.order_id,
        prefill: { name: user.name, email: user.email },
        theme: { color: "#9a4d32" },
        handler: async (resp: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verified = await apiFetch<{ verified: boolean; user?: User }>("/api/payments/verify", {
              method: "POST",
              body: JSON.stringify(resp),
            });
            if (verified.user) {
              onAuthChange(verified.user);
            } else {
              const me = await apiFetch<{ user: User }>("/api/auth/me");
              onAuthChange(me.user);
            }
            onMessage("ok", `${plan.name} plan activated via verified Razorpay payment!`);
          } catch (vErr) {
            onMessage("err", vErr instanceof Error ? vErr.message : "Verification failed.");
          }
        },
      });
      rzp.open();
    } catch (err) {
      onMessage("err", err instanceof Error ? err.message : "Unable to start payment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLaunchAd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/api/ads", {
        method: "POST",
        body: JSON.stringify({
          brand_name: brandName,
          headline,
          offer_text: offerText,
          category,
          target_occasion: targetOccasion,
          cta_url: ctaUrl,
          monthly_budget_inr: Number(budgetInr) || 5000,
        }),
      });
      setBrandName("");
      setHeadline("");
      setOfferText("");
      onRefreshAds();
      onMessage("ok", "Partner brand campaign is live in SAEE!");
    } catch (err) {
      onMessage("err", err instanceof Error ? err.message : "Could not publish ad.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "plans") {
    const expiryLabel = user?.plan_expires_at
      ? new Date(user.plan_expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "";
    return (
      <div>
        <div className="notice warn">
          <strong>All Services Require a Plan:</strong> Without buying a plan (or activating the 1-time{" "}
          <strong>7-Day Essential Free Trial</strong>), all SAEE services remain locked.{" "}
          <strong>No free trial</strong> is available for Professional (&#8377;199) or Studio Family (&#8377;499).
        </div>

        {!razorpayReady && (
          <div className="notice warn">
            <strong>Razorpay Setup Pending:</strong> Paid checkout requires{" "}
            <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> in{" "}
            <code>backend\.env</code>. You can still activate the 7-day Essential free trial right now!
            {!geminiReady && " (Gemini Vision uses profile-aware fallback until GEMINI_API_KEY is added.)"}
          </div>
        )}

        {user && (
          <div className={`notice ${user.plan_active ? "ok" : "err"}`}>
            <strong>Account Status ({user.email}):</strong>{" "}
            {user.plan_active
              ? `${String(user.plan_code).toUpperCase()} (${user.plan_status.toUpperCase()})${expiryLabel ? ` · Valid until ${expiryLabel}` : ""}`
              : "No active plan — start your 7-day Essential trial or buy a plan below to unlock SAEE services."}
          </div>
        )}

        {!user && (
          <div className="card" style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                className={`chip ${authTab === "register" ? "selected" : ""}`}
                onClick={() => setAuthTab("register")}
              >
                Create Account
              </button>
              <button
                type="button"
                className={`chip ${authTab === "login" ? "selected" : ""}`}
                onClick={() => setAuthTab("login")}
              >
                Sign In
              </button>
            </div>
            <form onSubmit={handleAuth} className="form-grid">
              {authTab === "register" && (
                <div className="field">
                  <label>Full Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g., Ananya Sharma" />
                </div>
              )}
              <div className="field">
                <label>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
              <div className="field">
                <label>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="Minimum 6 characters" />
              </div>
              <div style={{ display: "flex", alignItems: "end", paddingBottom: 10 }}>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {authTab === "register" ? "Create SAEE Account" : "Sign In"}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid-3">
          {plans.map((p) => {
            const isEssential = p.code === "essential";
            const isPaidCurrent = Boolean(user?.plan_active && user.plan_code === p.code && user.plan_status === "active");
            const isEssentialTrial = Boolean(isEssential && user?.plan_active && user.plan_code === "essential" && user.plan_status === "trial");
            return (
              <div key={p.code} className={`plan-card ${p.code === "professional" ? "featured" : ""}`}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0 }}>{p.name}</h3>
                    {isEssential ? (
                      <span className="chip selected" style={{ cursor: "default", padding: "4px 10px", fontSize: "0.76rem" }}>
                        {isEssentialTrial ? "7-Day Trial Active" : user?.trial_used ? "Trial Used" : "7-Day Free Trial"}
                      </span>
                    ) : (
                      <span className="chip" style={{ cursor: "default", padding: "4px 10px", fontSize: "0.76rem" }}>
                        Paid Only · No Trial
                      </span>
                    )}
                  </div>
                  <div className="price-inr">
                    &#8377;{p.price_inr} <span>/ {p.billing}</span>
                  </div>
                  <p className="muted">{p.tagline}</p>
                  <ul className="feature-list">
                    {p.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {isEssential && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy || Boolean(user && (user.plan_active || user.trial_used))}
                      onClick={startEssentialTrial}
                    >
                      {isEssentialTrial
                        ? "7-Day Trial Active"
                        : user?.trial_used
                          ? "7-Day Trial Already Used"
                          : "Start 7-Day Free Trial (Essential)"}
                    </button>
                  )}
                  <button
                    type="button"
                    className={isPaidCurrent ? "btn-secondary" : "btn-primary"}
                    disabled={busy || isPaidCurrent}
                    onClick={() => startCheckout(p)}
                  >
                    {isPaidCurrent ? "Current Paid Plan" : `Buy ${p.name} (INR ${p.price_inr}/mo)`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Active Partner Brand Ads</h2>
        <p className="muted">
          Monetized campaigns displayed to Essential (&#8377;99) &amp; Professional (&#8377;199) members. Studio Family (&#8377;499) is 100% ad-free.
        </p>
        {ads.map((ad) => (
          <div key={ad.id} className="result-box">
            <div className="ad-tag">{ad.category} &middot; {ad.target_occasion}</div>
            <strong>{ad.brand_name}</strong>: {ad.headline}
            <p className="muted" style={{ margin: "6px 0" }}>{ad.offer_text}</p>
            <small className="muted">
              Budget: &#8377;{ad.monthly_budget_inr}/mo &middot; Impressions: {ad.impressions} &middot; Clicks: {ad.clicks}
            </small>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Partner Brand Campaign Studio</h2>
        <p className="muted">
          Requires an active <strong>Studio Family (&#8377;499/mo)</strong> plan to publish sponsored brand campaigns.
        </p>
        <form onSubmit={handleLaunchAd}>
          <div className="field">
            <label>Brand Name</label>
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} required placeholder="e.g., Zari & Co" />
          </div>
          <div className="field">
            <label>Campaign Headline</label>
            <input value={headline} onChange={(e) => setHeadline(e.target.value)} required placeholder="e.g., Custom Tailored Linen Sets" />
          </div>
          <div className="field">
            <label>Offer Text</label>
            <input value={offerText} onChange={(e) => setOfferText(e.target.value)} required placeholder="e.g., 20% off for SAEE members" />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Category</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} required />
            </div>
            <div className="field">
              <label>Target Occasion</label>
              <input value={targetOccasion} onChange={(e) => setTargetOccasion(e.target.value)} required />
            </div>
            <div className="field">
              <label>Landing URL</label>
              <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} required />
            </div>
            <div className="field">
              <label>Monthly Budget (INR)</label>
              <input type="number" min={1000} value={budgetInr} onChange={(e) => setBudgetInr(e.target.value)} required />
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={busy}>
            Publish Partner Ad
          </button>
        </form>
      </div>
    </div>
  );
}
