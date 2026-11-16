import { FormEvent,  useEffect, useState  } from 'react';
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
  const [fitPref, setFitPref] = useState(profile.fit_preference || 'regular');
  const [result, setResult] = useState<{ best_size?: string; alternative_size?: string; confidence?: string; explanation?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setChest(String(profile.chest_cm || 100));
    setWaist(String(profile.waist_cm || 88));
    setFitPref(profile.fit_preference || 'regular');
  }, [profile.chest_cm, profile.waist_cm, profile.fit_preference]);

  function locked() {
    if (!user || !hasPlan) {
      onMessage('warn', 'SAEE services are currently paused.');
      onGoPlans();
      return true;
    }
    return false;
  }

  async function onCalc(e: FormEvent) {
    e.preventDefault();
    if (locked()) return;
    setBusy(true);
    setResult(null);
    try {
      const seed = await apiFetch<{ product_id: number }>('/api/demo/seed');
      const rec = await apiFetch<{ best_size?: string; alternative_size?: string; confidence?: string; explanation?: string[] }>(
        `/api/products/${seed.product_id}/recommend`,
        { method: 'POST', body: JSON.stringify({ measurements_cm: { chest: Number(chest), waist: Number(waist) }, fit_preference: fitPref }) }
      );
      setResult(rec);
    } catch (err) {
      onMessage('err', err instanceof Error ? err.message : 'Could not get your clothing size.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='card'>
      <h2>Clothing Size Finder</h2>
      <p className='muted'>Enter your chest and waist size to get the right everyday shirt or trouser fit.</p>
      <form onSubmit={onCalc}>
        <div className='form-grid'>
          <div className='field'>
            <label>Chest (cm)</label>
            <input type='number' value={chest} onChange={(e) => setChest(e.target.value)} required />
          </div>
          <div className='field'>
            <label>Waist (cm)</label>
            <input type='number' value={waist} onChange={(e) => setWaist(e.target.value)} required />
          </div>
        </div>
        <div className='field'>
          <label>Fit Style</label>
          <select value={fitPref} onChange={(e) => setFitPref(e.target.value)}>
            <option value='slim'>Slim Fit</option>
            <option value='regular'>Regular Fit</option>
            <option value='relaxed'>Loose / Relaxed</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type='submit' className='btn-primary' disabled={busy || !hasPlan}>
            {hasPlan ? 'Check My Size' : 'Loading...'}
          </button>
          <button type='button' className='btn-secondary' disabled={!hasPlan} onClick={() => { setChest(String(profile.chest_cm || 100)); setWaist(String(profile.waist_cm || 88)); setFitPref(profile.fit_preference || 'regular'); }}>
            Use My Saved Size
          </button>
        </div>
      </form>
      {result && (
        <div className='result-box'>
          <div className='big-size'>Your Size: {result.best_size || 'M'}</div>
          <div className='muted'>Other close size: {result.alternative_size || 'None'} - Match: {result.confidence || 'High'}</div>
          {Array.isArray(result.explanation) && (
            <ul className='feature-list'>
              {result.explanation.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}