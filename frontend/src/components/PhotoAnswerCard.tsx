import { ColourLookPreview, extractColours } from './ColourLookPreview';
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

export function SmartOutput({ title, data }: { title: string; data: any }) {
  if (!data) return null;
  const rec = data as Record<string, unknown>;
  const hide = new Set(['used_gemini', 'photo_received', 'photo_included', 'chart_verified', 'confidence_note']);
  const cols = extractColours(rec);
  const sh = (v: string) => { const x = v.replace(/Add GEMINI_API_KEY[^.]*[.]?/gi, '').replace(/\s+/g, ' ').trim(); return x.length > 140 ? x.slice(0, 137).trim() + '...' : x; };
  const lb = (k: string) => k.replace(/_/g, ' ').split(' ').map((w) => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
  const rows = Object.entries(rec).filter(([k, v]) => !hide.has(k) && v !== null && v !== '' && v !== undefined).slice(0, 5);
  return (
    <div className='result-box'>
      <h4 style={{ margin: '0 0 8px' }}>{title}</h4>
      <ColourLookPreview colours={cols} />
      {rows.map(([k, v]) => Array.isArray(v) ? (
        <div key={k} style={{ marginBottom: 6 }}>
          <strong>{lb(k)}:</strong>
          <ul className='feature-list' style={{ margin: '3px 0' }}>
            {v.slice(0, 3).map((x, i) => <li key={i}>{typeof x === 'object' && x !== null ? Object.values(x).slice(0, 2).join(' - ') : sh(String(x))}</li>)}
          </ul>
        </div>
      ) : (
        <div key={k} style={{ marginBottom: 5 }}><strong>{lb(k)}:</strong> <span>{sh(String(v))}</span></div>
      ))}
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
      onMessage("ok", "Your Style Look ready.");
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
      <SmartOutput title="Your Style Look" data={result} />
    </div>
  );
}
