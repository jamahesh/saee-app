import { useState } from "react";
import { apiFetch } from "../api";
import type { FamilyMemberInput, User, WardrobeItem } from "../types";
import { SmartOutput } from "./PhotoAnswerCard";

type Props = {
  user: User | null;
  wardrobe: WardrobeItem[];
  onWardrobeRefresh: () => void;
  onMessage: (kind: "ok" | "warn" | "err", text: string) => void;
  onGoPlans: () => void;
};

export function FamilyAndWardrobe({
  user,
  wardrobe,
  onWardrobeRefresh,
  onMessage,
  onGoPlans,
}: Props) {
  const hasPlan = Boolean(user?.plan_active);
  const [busy, setBusy] = useState(false);

  const [familyEvent, setFamilyEvent] = useState("Diwali Family Dinner");
  const [members, setMembers] = useState<FamilyMemberInput[]>([
    { label: "Self", body_colour: "Medium Wheatish", undertone: "Warm", preferred_fit: "Regular" },
    { label: "Partner", body_colour: "Olive", undertone: "Warm", preferred_fit: "Tailored" },
  ]);
  const [familyResult, setFamilyResult] = useState<Record<string, unknown> | null>(null);

  const [wTitle, setWTitle] = useState("");
  const [wCategory, setWCategory] = useState("Topwear");
  const [wColor, setWColor] = useState("Ivory");
  const [wOccasion, setWOccasion] = useState("Office Formal");
  const [wSize, setWSize] = useState("M");
  const [wNotes, setWNotes] = useState("");

  function needPlan(): boolean {
    if (!user) {
      onMessage("warn", "Please login and buy a plan or start the 7-day Essential trial first.");
      onGoPlans();
      return true;
    }
    if (!hasPlan) {
      onMessage("warn", "Active plan or 7-day Essential trial required.");
      onGoPlans();
      return true;
    }
    return false;
  }

  function updateMember(idx: number, patch: Partial<FamilyMemberInput>) {
    setMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  async function runFamily(e: React.FormEvent) {
    e.preventDefault();
    if (needPlan()) return;
    setBusy(true);
    try {
      const data = await apiFetch<Record<string, unknown>>("/api/style/family", {
        method: "POST",
        body: JSON.stringify({ occasion: familyEvent, members }),
      });
      setFamilyResult(data);
    } catch (err) {
      const msg = (err as Error).message;
      onMessage("err", msg);
      if (msg.toLowerCase().includes("plan") || msg.includes("403")) onGoPlans();
    } finally {
      setBusy(false);
    }
  }

  async function addWardrobe(e: React.FormEvent) {
    e.preventDefault();
    if (needPlan()) return;
    setBusy(true);
    try {
      await apiFetch("/api/wardrobe", {
        method: "POST",
        body: JSON.stringify({
          title: wTitle,
          category: wCategory,
          color: wColor,
          occasion: wOccasion,
          size_label: wSize,
          notes: wNotes,
        }),
      });
      setWTitle("");
      setWNotes("");
      onWardrobeRefresh();
      onMessage("ok", "Added to your Digital Wardrobe.");
    } catch (err) {
      const msg = (err as Error).message;
      onMessage("err", msg);
      if (msg.toLowerCase().includes("plan") || msg.includes("403")) onGoPlans();
    } finally {
      setBusy(false);
    }
  }

  async function removeWardrobe(id: number) {
    if (needPlan()) return;
    try {
      await apiFetch(`/api/wardrobe/${id}`, { method: "DELETE" });
      onWardrobeRefresh();
    } catch (err) {
      onMessage("err", (err as Error).message);
    }
  }

  return (
    <div className="grid-2" style={{ marginTop: 18 }}>
      <div className="card">
        <h3>Family Section (Studio Plan ₹499/mo)</h3>
        <p className="muted">
          Coordinated colour palettes and silhouettes across family members.
        </p>
        {!hasPlan && (
          <div className="notice warn" style={{ marginBottom: 12 }}>
            Locked until you activate a plan.{" "}
            <button type="button" className="btn-secondary" onClick={onGoPlans}>
              View Plans
            </button>
          </div>
        )}
        <form onSubmit={runFamily} className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <div className="field">
            <label>Family Event</label>
            <input value={familyEvent} onChange={(e) => setFamilyEvent(e.target.value)} required />
          </div>
          {members.map((m, idx) => (
            <div
              key={idx}
              style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10 }}
            >
              <div className="form-grid">
                <div className="field">
                  <label>Member</label>
                  <input
                    value={m.label}
                    onChange={(e) => updateMember(idx, { label: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Body Colour</label>
                  <input
                    value={m.body_colour}
                    onChange={(e) => updateMember(idx, { body_colour: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Undertone</label>
                  <input
                    value={m.undertone}
                    onChange={(e) => updateMember(idx, { undertone: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Preferred Fit</label>
                  <input
                    value={m.preferred_fit}
                    onChange={(e) => updateMember(idx, { preferred_fit: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="chip-row">
            <button
              type="button"
              className="btn-secondary"
              disabled={members.length >= 5}
              onClick={() =>
                setMembers((prev) => [
                  ...prev,
                  {
                    label: `Member ${prev.length + 1}`,
                    body_colour: "Wheatish",
                    undertone: "Neutral",
                    preferred_fit: "Regular",
                  },
                ])
              }
            >
              + Add Member
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !hasPlan}>
              {hasPlan ? "Generate Family Plan" : "Plan Required"}
            </button>
          </div>
        </form>
        <SmartOutput title="Family Coordinated Styling Plan" data={familyResult} />
      </div>

      <div className="card">
        <h3>Digital Wardrobe (Professional ₹199/mo+)</h3>
        <p className="muted">Save outfits you own so SAEE includes them in styling plans.</p>
        {!hasPlan && (
          <div className="notice warn" style={{ marginBottom: 12 }}>
            Locked until you activate a plan.{" "}
            <button type="button" className="btn-secondary" onClick={onGoPlans}>
              View Plans
            </button>
          </div>
        )}
        <form onSubmit={addWardrobe} className="form-grid">
          <div className="field">
            <label>Item Title</label>
            <input
              value={wTitle}
              onChange={(e) => setWTitle(e.target.value)}
              required
              placeholder="e.g., Ivory Linen Blazer"
            />
          </div>
          <div className="field">
            <label>Category</label>
            <select value={wCategory} onChange={(e) => setWCategory(e.target.value)}>
              <option value="Topwear">Topwear</option>
              <option value="Bottomwear">Bottomwear</option>
              <option value="Ethnic">Ethnic</option>
              <option value="Footwear">Footwear</option>
              <option value="Outerwear">Outerwear</option>
            </select>
          </div>
          <div className="field">
            <label>Colour</label>
            <input value={wColor} onChange={(e) => setWColor(e.target.value)} required />
          </div>
          <div className="field">
            <label>Best Occasion</label>
            <input value={wOccasion} onChange={(e) => setWOccasion(e.target.value)} required />
          </div>
          <div className="field">
            <label>Size Label</label>
            <input value={wSize} onChange={(e) => setWSize(e.target.value)} required />
          </div>
          <div className="field">
            <label>Notes</label>
            <input
              value={wNotes}
              onChange={(e) => setWNotes(e.target.value)}
              placeholder="Fit or pairing note"
            />
          </div>
          <div>
            <button type="submit" className="btn-primary" disabled={busy || !hasPlan}>
              {hasPlan ? "Save to Wardrobe" : "Plan Required"}
            </button>
          </div>
        </form>
        <div className="wardrobe-list">
          {wardrobe.map((item) => (
            <div key={item.id} className="wardrobe-item">
              <div>
                <strong>{item.title}</strong> ({item.size_label})
                <div className="muted">
                  {item.category} &middot; {item.color} &middot; {item.occasion}
                </div>
                {item.notes && <small className="muted">{item.notes}</small>}
              </div>
              <button
                type="button"
                className="btn-danger"
                disabled={!hasPlan}
                onClick={() => removeWardrobe(item.id)}
              >
                Delete
              </button>
            </div>
          ))}
          {wardrobe.length === 0 && (
            <p className="muted">No wardrobe pieces saved yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
