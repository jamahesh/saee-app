import { useState } from "react";
import { apiFetch } from "../api";
import type { ProfileData, User, WardrobeItem } from "../types";
import { BodyColourPanel } from "./BodyColourPanel";
import { fileToCompressedBase64, SmartOutput, type PhotoPayload } from "./PhotoAnswerCard";
import { FamilyAndWardrobe } from "./WardrobeAndFamily";

type Props = {
  mode: "body" | "occasion";
  user: User | null;
  profile: ProfileData;
  wardrobe: WardrobeItem[];
  onProfileChange: (p: ProfileData) => void;
  onWardrobeRefresh: () => void;
  onMessage: (kind: "ok" | "warn" | "err", text: string) => void;
  onGoPlans: () => void;
};

const OCCASIONS = [
  "Birthday",
  "College",
  "School",
  "Wedding Festive",
  "Office Formal",
  "Date Night",
  "Casual Travel",
];

export function StyleStudio({
  mode,
  user,
  profile,
  wardrobe,
  onProfileChange,
  onWardrobeRefresh,
  onMessage,
  onGoPlans,
}: Props) {
  const hasPlan = Boolean(user?.plan_active);
  const [busy, setBusy] = useState(false);

  const [occasion, setOccasion] = useState("Birthday");
  const [budgetInr, setBudgetInr] = useState("5000");
  const [occNotes, setOccNotes] = useState("");
  const [occPhoto, setOccPhoto] = useState<PhotoPayload | null>(null);
  const [occasionResult, setOccasionResult] = useState<Record<string, unknown> | null>(null);

  const [coupleOccasion, setCoupleOccasion] = useState("Wedding Festive");
  const [partnerColour, setPartnerColour] = useState("Medium Wheatish");
  const [partnerUndertone, setPartnerUndertone] = useState("Warm");
  const [coupleVibe, setCoupleVibe] = useState("Coordinated Elegant");
  const [coupleResult, setCoupleResult] = useState<Record<string, unknown> | null>(null);

  function needPlan(): boolean {
    if (!user || !hasPlan) {
      onMessage("warn", "Active plan or 7-day Essential trial required.");
      onGoPlans();
      return true;
    }
    return false;
  }

  function handleErr(err: unknown) {
    const msg = (err as Error).message;
    onMessage("err", msg);
    if (msg.toLowerCase().includes("plan") || msg.includes("403")) onGoPlans();
  }

  async function pickOccPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setOccPhoto(await fileToCompressedBase64(f));
    } catch (err) {
      onMessage("err", err instanceof Error ? err.message : "Could not load photo.");
    }
  }

  async function runOccasion(e: React.FormEvent) {
    e.preventDefault();
    if (needPlan()) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        occasion,
        budget_inr: Number(budgetInr) || 5000,
        notes: `Budget INR ${Number(budgetInr) || 5000}. ${occNotes}`.trim(),
      };
      if (occPhoto) {
        body.image_base64 = occPhoto.base64;
        body.mime_type = occPhoto.mimeType;
      }
      setOccasionResult(
        await apiFetch("/api/style/occasion", { method: "POST", body: JSON.stringify(body) })
      );
    } catch (err) {
      handleErr(err);
    } finally {
      setBusy(false);
    }
  }

  async function runCouple(e: React.FormEvent) {
    e.preventDefault();
    if (needPlan()) return;
    setBusy(true);
    try {
      setCoupleResult(
        await apiFetch("/api/style/couple", {
          method: "POST",
          body: JSON.stringify({
            occasion: coupleOccasion,
            partner_body_colour: partnerColour,
            partner_undertone: partnerUndertone,
            notes: coupleVibe,
          }),
        })
      );
    } catch (err) {
      handleErr(err);
    } finally {
      setBusy(false);
    }
  }

  if (mode === "body") {
    return (
      <BodyColourPanel
        user={user}
        profile={profile}
        onProfileChange={onProfileChange}
        onMessage={onMessage}
        onGoPlans={onGoPlans}
      />
    );
  }

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <h3>Occasion Styling</h3>
          <p className="muted">
            Select an occasion and optionally attach a photo for personalised looks.
          </p>
          <div className="chip-row" style={{ marginBottom: 12 }}>
            {OCCASIONS.map((o) => (
              <button
                key={o}
                type="button"
                className={`chip ${occasion === o ? "selected" : ""}`}
                onClick={() => setOccasion(o)}
              >
                {o}
              </button>
            ))}
          </div>
          <form onSubmit={runOccasion} className="form-grid">
            <div className="field">
              <label>Budget (INR)</label>
              <input type="number" value={budgetInr} onChange={(e) => setBudgetInr(e.target.value)} />
            </div>
            <div className="field">
              <label>Optional Outfit Photo</label>
              <input type="file" accept="image/*" onChange={pickOccPhoto} />
            </div>
            {occPhoto && (
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10 }}>
                <img
                  src={occPhoto.previewUrl}
                  alt="Occasion look preview"
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }}
                />
                <button type="button" className="btn-secondary" onClick={() => setOccPhoto(null)}>
                  Remove Photo
                </button>
              </div>
            )}
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Notes (Venue, Weather, Dress Code)</label>
              <input
                value={occNotes}
                onChange={(e) => setOccNotes(e.target.value)}
                placeholder="e.g., Outdoor evening party"
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="btn-primary" disabled={busy || !hasPlan}>
                {hasPlan ? "Generate Occasion Outfit" : "Loading..."}
              </button>
            </div>
          </form>
          <SmartOutput title="SAEE Occasion Styling Plan" data={occasionResult} />
        </div>

        <div className="card">
          <h3>Couple Matching</h3>
          <p className="muted">Harmonise colours, silhouettes, and contrast with your partner.</p>
          <form onSubmit={runCouple} className="form-grid">
            <div className="field">
              <label>Occasion</label>
              <input value={coupleOccasion} onChange={(e) => setCoupleOccasion(e.target.value)} required />
            </div>
            <div className="field">
              <label>Partner Body Colour</label>
              <input value={partnerColour} onChange={(e) => setPartnerColour(e.target.value)} required />
            </div>
            <div className="field">
              <label>Partner Undertone</label>
              <input value={partnerUndertone} onChange={(e) => setPartnerUndertone(e.target.value)} required />
            </div>
            <div className="field">
              <label>Mood / Vibe</label>
              <input value={coupleVibe} onChange={(e) => setCoupleVibe(e.target.value)} required />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="btn-primary" disabled={busy || !hasPlan}>
                {hasPlan ? "Match Couple Outfits" : "Loading..."}
              </button>
            </div>
          </form>
          <SmartOutput title="Couple Matching Guide" data={coupleResult} />
        </div>
      </div>

      <FamilyAndWardrobe
        user={user}
        wardrobe={wardrobe}
        onWardrobeRefresh={onWardrobeRefresh}
        onMessage={onMessage}
        onGoPlans={onGoPlans}
      />
    </>
  );
}
