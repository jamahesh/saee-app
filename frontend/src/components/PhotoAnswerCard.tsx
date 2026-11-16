import { useState } from "react";
import { apiFetch } from "../api";

export type PhotoPayload = {
  base64: string;
  mimeType: string;
  previewUrl: string;
};

export async function fileToCompressedBase64(file: File): Promise<PhotoPayload> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Unsupported image format."));
    el.src = dataUrl;
  });
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const outUrl = canvas.toDataURL("image/jpeg", 0.82);
  const base64 = outUrl.split(",")[1] || "";
  return { base64, mimeType: "image/jpeg", previewUrl: outUrl };
}

export function SmartOutput({ title, data }: { title: string; data: Record<string, unknown> | null }) {
  if (!data) return null;
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "");
  return (
    <div className="result-box">
      <h4 style={{ margin: "0 0 10px" }}>{title}</h4>
      {entries.map(([k, v]) => {
        const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        if (Array.isArray(v)) {
          return (
            <div key={k} style={{ marginBottom: 8 }}>
              <strong>{label}:</strong>
              <ul className="feature-list" style={{ margin: "4px 0" }}>
                {v.map((item, idx) => (
                  <li key={idx}>
                    {typeof item === "object" && item !== null
                      ? Object.entries(item as Record<string, unknown>)
                          .map(([ik, iv]) => `${ik}: ${String(iv)}`)
                          .join(" | ")
                      : String(item)}
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        if (typeof v === "object" && v !== null) {
          return (
            <div key={k} style={{ marginBottom: 8 }}>
              <strong>{label}:</strong>{" "}
              <span className="muted">
                {Object.entries(v as Record<string, unknown>)
                  .map(([sk, sv]) => `${sk}: ${String(sv)}`)
                  .join(" | ")}
              </span>
            </div>
          );
        }
        return (
          <div key={k} style={{ marginBottom: 6 }}>
            <strong>{label}:</strong> <span>{String(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function PhotoAnswerCard({
  hasPlan,
  onMessage,
  onGoPlans,
}: {
  hasPlan: boolean;
  onMessage: (kind: "ok" | "warn" | "err", text: string) => void;
  onGoPlans: () => void;
}) {
  const [photo, setPhoto] = useState<PhotoPayload | null>(null);
  const [occasion, setOccasion] = useState("Personal Style Check");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await fileToCompressedBase64(file));
    } catch (err) {
      onMessage("err", err instanceof Error ? err.message : "Could not read photo.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasPlan) {
      onMessage("warn", "Activate the 7-day Essential trial or buy a plan to use Photo Answer.");
      onGoPlans();
      return;
    }
    if (!photo) {
      onMessage("warn", "Choose a photo first (optional feature).");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<Record<string, unknown>>("/api/style/photo", {
        method: "POST",
        body: JSON.stringify({
          image_base64: photo.base64,
          mime_type: photo.mimeType,
          occasion,
          question,
        }),
      });
      setResult(res);
      onMessage("ok", "SAEE Photo Answer ready.");
    } catch (err) {
      onMessage("err", err instanceof Error ? err.message : "Photo Answer failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Optional Photo Answer (If You Want)</h2>
      <p className="muted">
        Upload an optional outfit or mirror photo for tailored fit, colour-harmony, and styling answers.
      </p>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>Upload Outfit Photo (Optional)</label>
            <input type="file" accept="image/*" onChange={onPick} />
          </div>
          <div className="field">
            <label>Occasion Context</label>
            <input value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="e.g., Birthday, College, Interview" />
          </div>
        </div>
        <div className="field">
          <label>Your Style Question (Optional)</label>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g., Does this collar and shade fit my undertone?" />
        </div>
        {photo && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
            <img src={photo.previewUrl} alt="Uploaded look preview" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 12, border: "1px solid var(--border)" }} />
            <button type="button" className="btn-secondary" onClick={() => { setPhoto(null); setResult(null); }}>
              Remove Photo
            </button>
          </div>
        )}
        <button type="submit" className="btn-primary" disabled={busy || !hasPlan}>
          {hasPlan ? "Get Photo Answer" : "Loading..."}
        </button>
      </form>
      <SmartOutput title="SAEE Photo Answer" data={result} />
    </div>
  );
}
