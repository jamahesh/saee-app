import { useState } from "react";
import { apiFetch } from "../api";
import type { ProfileData, User } from "../types";
import { PhotoAnswerCard, SmartOutput } from "./PhotoAnswerCard";

type Props = {
  user: User | null;
  profile: ProfileData;
  onProfileChange: (p: ProfileData) => void;
  onMessage: (kind: "ok" | "warn" | "err", text: string) => void;
  onGoPlans: () => void;
};

const NUM_FIELDS: [keyof ProfileData, string, string?][] = [
  ["height_cm", "Height (cm)"],
  ["weight_kg", "Weight (kg)"],
  ["chest_cm", "Chest (cm)"],
  ["waist_cm", "Waist (cm)"],
  ["hips_cm", "Hips (cm)"],
  ["shoulder_cm", "Shoulder (cm)"],
];

export function BodyColourPanel({ user, profile, onProfileChange, onMessage, onGoPlans }: Props) {
  const hasPlan = Boolean(user?.plan_active);
  const [busy, setBusy] = useState(false);
  const [colorResult, setColorResult] = useState<Record<string, unknown> | null>(null);

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

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (needPlan()) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ profile: ProfileData }>("/api/profile", {
        method: "PUT",
        body: JSON.stringify(profile),
      });
      onProfileChange(res.profile);
      onMessage("ok", "SAEE body & colour profile saved.");
    } catch (err) {
      handleErr(err);
    } finally {
      setBusy(false);
    }
  }

  async function runColourAnalysis() {
    if (needPlan()) return;
    setBusy(true);
    try {
      await apiFetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify(profile),
      });
      setColorResult(await apiFetch("/api/style/colour"));
    } catch (err) {
      handleErr(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <h3>Saved Body &amp; Colour Profile</h3>
          <p className="muted">Save your body colour, undertone, and measurements once.</p>
          <form onSubmit={saveProfile} className="form-grid">
            <div className="field">
              <label>Body Colour</label>
              <select
                value={profile.body_colour}
                onChange={(e) => onProfileChange({ ...profile, body_colour: e.target.value })}
              >
                {["Fair", "Light", "Medium Wheatish", "Olive", "Tan / Golden Brown", "Deep"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Undertone</label>
              <select
                value={profile.undertone}
                onChange={(e) => onProfileChange({ ...profile, undertone: e.target.value })}
              >
                {["Warm", "Cool", "Neutral", "Olive"].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            {NUM_FIELDS.map(([key, label, step]) => (
              <div key={key} className="field">
                <label>{label}</label>
                <input
                  type="number"
                  step={step}
                  value={profile[key]}
                  onChange={(e) => onProfileChange({ ...profile, [key]: Number(e.target.value) })}
                />
              </div>
            ))}
            <div className="field">
              <label>Fit Preference</label>
              <select
                value={profile.fit_preference}
                onChange={(e) => onProfileChange({ ...profile, fit_preference: e.target.value })}
              >
                <option value="slim">Slim</option>
                <option value="regular">Regular</option>
                <option value="relaxed">Relaxed</option>
              </select>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Style Vibe</label>
              <input
                value={profile.style_vibe}
                onChange={(e) => onProfileChange({ ...profile, style_vibe: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="btn-primary" disabled={busy || !hasPlan}>
                {hasPlan ? "Save SAEE Profile" : "Loading..."}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3>Skin Tone Colour Analysis</h3>
          <p className="muted">
            Instant colour guide tailored to <strong>{profile.body_colour}</strong> ({profile.undertone} undertone).
          </p>
          <button type="button" className="btn-primary" disabled={busy || !hasPlan} onClick={runColourAnalysis}>
            {hasPlan ? "Analyze My Best Colours" : "Loading..."}
          </button>
          <SmartOutput title="Your Best Colours" data={colorResult} />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <PhotoAnswerCard hasPlan={hasPlan} onMessage={onMessage} onGoPlans={onGoPlans} />
      </div>
    </>
  );
}
