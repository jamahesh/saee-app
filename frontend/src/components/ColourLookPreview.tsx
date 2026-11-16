import { useEffect, useState } from 'react';

const H: Record<string, string> = {
  olive: '#556B2F', moss: '#4A5D23', terracotta: '#C0563B', rust: '#A64B2A',
  ivory: '#EDE6D6', cream: '#EFE6D5', mustard: '#C79325', ochre: '#BA8523',
  espresso: '#4A3222', brown: '#5C3D2E', emerald: '#1E6B52', navy: '#1F305E',
  burgundy: '#6E1E33', wine: '#661E31', cobalt: '#224C98', coral: '#D96B52',
  blush: '#DFA8A3', sage: '#7E967E', teal: '#1D6B6B', plum: '#5E2B57',
  charcoal: '#36393F', black: '#1C1D20', white: '#F4F4F0', beige: '#C8B89A',
  camel: '#B5895A', gold: '#C99E32', amber: '#C87D20', peach: '#E8A587',
  lavender: '#9B89B3', maroon: '#6B1D2F', sand: '#CDB89D', rose: '#C46C7B',
  denim: '#375B8A', khaki: '#A39161', taupe: '#7A6B5D', copper: '#B86B43'
};

export const pickHex = (n: string) => {
  const l = n.toLowerCase();
  for (const [k, v] of Object.entries(H)) if (l.includes(k)) return v;
  return '#4F6272';
};

export function extractColours(d: Record<string, unknown>): string[] {
  const o: string[] = [];
  const add = (v: string) => { const t = v.trim(); if (t && t.length < 28 && !o.includes(t)) o.push(t); };
  for (const k of ['best_colours', 'colour_story', 'colours', 'recommended_colours', 'suggested_colours']) {
    const v = d[k]; if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && add(x));
  }
  if (!o.length) {
    const txt = [d.colour_harmony, d.headline_look, d.outfit_pairing, d.palette].filter((x) => typeof x === 'string').join(' ');
    for (const p of txt.split(/[,;.]/)) {
      const l = p.toLowerCase();
      if (Object.keys(H).some((k) => l.includes(k))) {
        const c = p.replace(/^.*?(?:tones|you|palette|anchor|with|colours?)[: ]+/i, '').trim();
        if (c.length >= 3 && c.length <= 26) add(c);
      }
    }
  }
  return o.slice(0, 5);
}

export const saveUserPhoto = (u: string) => { try { localStorage.setItem('saee_user_photo', u); window.dispatchEvent(new Event('saee-photo')); } catch {} };
export const readUserPhoto = () => { try { return localStorage.getItem('saee_user_photo') || ''; } catch { return ''; } };

function resizeUp(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(f);
    img.onload = () => {
      const s = Math.min(1, 640 / Math.max(img.width, img.height, 1)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      const x = c.getContext('2d'); URL.revokeObjectURL(u);
      if (!x) return rej(new Error('No canvas'));
      x.drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Bad photo')); };
    img.src = u;
  });
}

export function ColourLookPreview({ colours, compact = false }: { colours: string[]; compact?: boolean }) {
  const [photo, setPhoto] = useState(readUserPhoto);
  const [sel, setSel] = useState(colours[0] || '');
  useEffect(() => { if (colours.length && !colours.includes(sel)) setSel(colours[0]); }, [colours, sel]);
  useEffect(() => {
    const sync = () => setPhoto(readUserPhoto());
    window.addEventListener('saee-photo', sync); window.addEventListener('storage', sync);
    return () => { window.removeEventListener('saee-photo', sync); window.removeEventListener('storage', sync); };
  }, []);
  if (!colours.length) return null;
  const active = sel || colours[0], hex = pickHex(active);
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    try { const u = await resizeUp(f); saveUserPhoto(u); setPhoto(u); } catch {}
  }
  return (
    <div className={compact ? 'look-preview compact' : 'look-preview'}>
      <div className='look-head'>
        <span className='look-title'>How {active} looks on you</span>
        <label className='look-upload'>{photo ? 'Change photo' : 'Upload photo'}<input type='file' accept='image/*' hidden onChange={onPick} /></label>
      </div>
      <div className='swatch-row'>
        {colours.map((c) => (
          <button key={c} type='button' className={'swatch-btn' + (active === c ? ' active' : '')} onClick={() => setSel(c)}>
            <span className='swatch-dot' style={{ background: pickHex(c) }} /><span>{c}</span>
          </button>
        ))}
      </div>
      {photo ? (
        <div className='look-stage' style={{ borderColor: hex }}>
          <img src={photo} alt={'You in ' + active} className='look-img' />
          <div className='look-tint' style={{ background: hex }} />
          <div className='look-tint-glow' style={{ background: hex }} />
          <div className='look-badge'><span className='swatch-dot' style={{ background: hex }} /><span>In {active}</span></div>
        </div>
      ) : (
        <label className='look-empty'>Add a quick photo to see {active} on you<input type='file' accept='image/*' hidden onChange={onPick} /></label>
      )}
    </div>
  );
}
