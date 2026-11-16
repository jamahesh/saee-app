import { useEffect, useMemo, useRef, useState } from 'react';

const H: Record<string, [number, number, number]> = {
  olive: [85, 107, 47], moss: [74, 93, 35], terracotta: [192, 86, 59], rust: [166, 75, 42],
  ivory: [237, 230, 214], cream: [239, 230, 213], mustard: [199, 147, 37], ochre: [186, 133, 35],
  espresso: [74, 50, 34], brown: [92, 61, 46], emerald: [30, 107, 82], navy: [31, 48, 94],
  burgundy: [110, 30, 51], wine: [102, 30, 49], cobalt: [34, 76, 152], coral: [217, 107, 82],
  blush: [223, 168, 163], sage: [126, 150, 126], teal: [29, 107, 107], plum: [94, 43, 87],
  charcoal: [54, 57, 63], black: [28, 29, 32], white: [244, 244, 240], beige: [200, 184, 154],
  camel: [181, 137, 90], gold: [201, 158, 50], amber: [200, 125, 32], peach: [232, 165, 135],
  lavender: [155, 137, 179], maroon: [107, 29, 47], sand: [205, 184, 157], rose: [196, 108, 123],
  denim: [55, 91, 138], khaki: [163, 145, 97], taupe: [122, 107, 93], copper: [184, 107, 67]
};

export type OutfitMatch = {
  name: string;
  colour: string;
  score: number;
  why: string;
  pieces: string;
};

export function pickRgb(n: string): [number, number, number] {
  const l = n.toLowerCase();
  for (const [k, v] of Object.entries(H)) if (l.includes(k)) return v;
  return [79, 98, 114];
}

export function pickHex(n: string): string {
  const [r, g, b] = pickRgb(n);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

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

export function buildOutfitMatches(d: Record<string, unknown>, cols: string[]): OutfitMatch[] {
  if (Array.isArray(d.outfit_matches) && d.outfit_matches.length) {
    return (d.outfit_matches as OutfitMatch[]).slice(0, 4);
  }
  const c0 = cols[0] || 'Olive Moss';
  const c1 = cols[1] || 'Terracotta Rust';
  const c2 = cols[2] || 'Warm Ivory';
  const sz = typeof d.recommended_size === 'string' ? d.recommended_size : 'tailored fit';
  const occ = typeof d.occasion === 'string' ? d.occasion : 'everyday & event';
  return [
    { name: 'Structured Shirt / Kurta Look', colour: c0, score: 96, why: 'Top tone harmony + crisp ' + sz + ' cut for ' + occ, pieces: c0 + ' top + Warm Ivory trousers + clean loafers' },
    { name: 'Smart Textured Layer Set', colour: c1, score: 91, why: 'Rich contrast with natural skin brightness', pieces: c1 + ' overshirt/dress + Espresso belt & watch' },
    { name: 'Relaxed Neutral Base', colour: c2, score: 85, why: 'Balanced minimal contrast, easy to accessorise', pieces: c2 + ' linen set + brushed gold accent' }
  ];
}

export const saveUserPhoto = (u: string) => { try { localStorage.setItem('saee_user_photo', u); window.dispatchEvent(new Event('saee-photo')); } catch {} };
export const readUserPhoto = () => { try { return localStorage.getItem('saee_user_photo') || ''; } catch { return ''; } };

function resizeUp(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(f);
    img.onload = () => {
      const s = Math.min(1, 560 / Math.max(img.width, img.height, 1)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      const x = c.getContext('2d'); URL.revokeObjectURL(u);
      if (!x) return rej(new Error('No canvas'));
      x.drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Bad photo')); };
    img.src = u;
  });
}

function isSkin(r: number, g: number, b: number): boolean {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return r > 92 && g > 40 && b > 20 && (mx - mn) > 14 && Math.abs(r - g) > 12 && r > g && r > b;
}

function recolourDressOnCanvas(photoUrl: string, targetRgb: [number, number, number], seed: [number, number]): Promise<string> {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = Math.min(360, img.width || 360);
      const h = Math.max(1, Math.round((img.height || 450) * (w / (img.width || 360))));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return res(photoUrl);
      ctx.drawImage(img, 0, 0, w, h);
      const id = ctx.getImageData(0, 0, w, h);
      const d = id.data;

      let br = 0, bg = 0, bb = 0, bc = 0;
      for (let y = 0; y < Math.floor(h * 0.5); y += 4) {
        for (const x of [2, w - 3]) {
          const i = (y * w + x) * 4;
          br += d[i]; bg += d[i + 1]; bb += d[i + 2]; bc++;
        }
      }
      if (bc) { br /= bc; bg /= bc; bb /= bc; }

      const sx = Math.max(10, Math.min(w - 11, Math.round(seed[0] * w)));
      const sy = Math.max(Math.round(h * 0.25), Math.min(h - 11, Math.round(seed[1] * h)));
      let sr = 0, sg = 0, sb = 0, sc = 0;
      for (let dy = -14; dy <= 14; dy += 2) {
        for (let dx = -14; dx <= 14; dx += 2) {
          const i = ((sy + dy) * w + (sx + dx)) * 4;
          const r = d[i], g = d[i + 1], b = d[i + 2];
          if (!isSkin(r, g, b)) { sr += r; sg += g; sb += b; sc++; }
        }
      }
      if (!sc) {
        const i = (sy * w + sx) * 4;
        sr = d[i]; sg = d[i + 1]; sb = d[i + 2]; sc = 1;
      }
      sr /= sc; sg /= sc; sb /= sc;
      const seedLum = Math.max(0.14, (0.299 * sr + 0.587 * sg + 0.114 * sb) / 255);

      const mask = new Float32Array(w * h);
      const vis = new Uint8Array(w * h);
      const q = new Int32Array(w * h);
      let qh = 0, qt = 0;
      const pushSeed = (px: number, py: number) => {
        if (px < 0 || px >= w || py < 0 || py >= h) return;
        const idx = py * w + px;
        if (vis[idx]) return;
        const i = idx * 4;
        if (isSkin(d[i], d[i + 1], d[i + 2])) return;
        vis[idx] = 1; q[qt++] = idx;
      };
      for (let dy = -10; dy <= 10; dy += 5) for (let dx = -10; dx <= 10; dx += 5) pushSeed(sx + dx, sy + dy);

      const maxColDist = 78;
      const minY = Math.round(h * 0.24);
      while (qh < qt) {
        const cur = q[qh++];
        const cx = cur % w, cy = (cur / w) | 0;
        const i = cur * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (cy < minY || isSkin(r, g, b)) continue;
        const distSeed = Math.hypot(r - sr, g - sg, b - sb);
        const distWall = Math.hypot(r - br, g - bg, b - bb);
        if (distSeed > maxColDist) continue;
        if (bc > 0 && distWall < 22 && distSeed > 20) continue;
        mask[cur] = Math.max(0.25, Math.min(1, 1.18 - distSeed / maxColDist));
        if (cx > 1 && !vis[cur - 1]) { vis[cur - 1] = 1; q[qt++] = cur - 1; }
        if (cx < w - 2 && !vis[cur + 1]) { vis[cur + 1] = 1; q[qt++] = cur + 1; }
        if (cy > minY && !vis[cur - w]) { vis[cur - w] = 1; q[qt++] = cur - w; }
        if (cy < h - 2 && !vis[cur + w]) { vis[cur + w] = 1; q[qt++] = cur + w; }
      }

      const [tr, tg, tb] = targetRgb;
      for (let p = 0; p < w * h; p++) {
        const a = mask[p];
        if (a <= 0) continue;
        const i = p * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const shade = Math.max(0.32, Math.min(1.38, lum / seedLum));
        const nr = Math.min(255, tr * shade);
        const ng = Math.min(255, tg * shade);
        const nb = Math.min(255, tb * shade);
        d[i] = Math.round(r * (1 - a) + nr * a);
        d[i + 1] = Math.round(g * (1 - a) + ng * a);
        d[i + 2] = Math.round(b * (1 - a) + nb * a);
      }
      ctx.putImageData(id, 0, 0);
      res(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => res(photoUrl);
    img.src = photoUrl;
  });
}

export function ColourLookPreview({ colours, outfits = [], compact = false }: { colours: string[]; outfits?: OutfitMatch[]; compact?: boolean }) {
  const [photo, setPhoto] = useState(readUserPhoto);
  const [selCol, setSelCol] = useState(colours[0] || '');
  const [rendered, setRendered] = useState('');
  const [showOrig, setShowOrig] = useState(false);
  const [seed, setSeed] = useState<[number, number]>([0.5, 0.56]);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => { if (colours.length && !colours.includes(selCol)) setSelCol(colours[0]); }, [colours, selCol]);
  useEffect(() => {
    const sync = () => setPhoto(readUserPhoto());
    window.addEventListener('saee-photo', sync); window.addEventListener('storage', sync);
    return () => { window.removeEventListener('saee-photo', sync); window.removeEventListener('storage', sync); };
  }, []);

  const active = selCol || colours[0] || '';
  const rgb = useMemo(() => pickRgb(active), [active]);

  useEffect(() => {
    let alive = true;
    if (!photo || !active) { setRendered(''); return; }
    recolourDressOnCanvas(photo, rgb, seed).then((out) => { if (alive) setRendered(out); });
    return () => { alive = false; };
  }, [photo, rgb, active, seed]);

  if (!colours.length && !outfits.length) return null;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    try { const u = await resizeUp(f); saveUserPhoto(u); setPhoto(u); setSeed([0.5, 0.56]); } catch {}
  }

  function onTapStage(e: React.MouseEvent<HTMLImageElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0.1, Math.min(0.9, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0.28, Math.min(0.88, (e.clientY - rect.top) / rect.height));
    setSeed([x, y]);
    setShowOrig(false);
  }

  const bestOutfit = outfits[0];

  return (
    <div className={compact ? 'look-preview compact' : 'look-preview'}>
      <div className='look-head'>
        <span className='look-title'>Dress Colour Try-On: {active}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {photo && (
            <button type='button' className='look-upload' onClick={() => setShowOrig((v) => !v)}>
              {showOrig ? 'Show Styled' : 'Original'}
            </button>
          )}
          <label className='look-upload'>
            {photo ? 'Change photo' : 'Upload photo'}
            <input type='file' accept='image/*' hidden onChange={onPick} />
          </label>
        </div>
      </div>

      {colours.length > 0 && (
        <div className='swatch-row'>
          {colours.map((c) => (
            <button key={c} type='button' className={'swatch-btn' + (active === c ? ' active' : '')} onClick={() => { setSelCol(c); setShowOrig(false); }}>
              <span className='swatch-dot' style={{ background: pickHex(c) }} /><span>{c}</span>
            </button>
          ))}
        </div>
      )}

      {photo ? (
        <div className='look-stage' style={{ borderColor: pickHex(active) }}>
          <img
            ref={imgRef}
            src={showOrig ? photo : (rendered || photo)}
            alt={'Your dress in ' + active}
            className='look-img'
            onClick={onTapStage}
            title='Tap directly on your shirt/dress to pinpoint fabric'
          />
          <div className='look-badge'>
            <span className='swatch-dot' style={{ background: pickHex(active) }} />
            <span>{showOrig ? 'Original Photo' : 'Dress in ' + active}</span>
          </div>
          <span className='look-hint'>Tap dress to adjust</span>
        </div>
      ) : (
        <label className='look-empty'>Upload your photo to change your dress colour to {active}<input type='file' accept='image/*' hidden onChange={onPick} /></label>
      )}

      {outfits.length > 0 && (
        <div className='outfit-match-list'>
          <div className='outfit-match-head'>Best Matching Outfits & Score</div>
          {outfits.map((o, i) => (
            <button
              key={o.name + i}
              type='button'
              className={'outfit-match-card' + (active.toLowerCase() === o.colour.toLowerCase() ? ' active' : '')}
              onClick={() => { setSelCol(o.colour); setShowOrig(false); }}
            >
              <div className='outfit-match-top'>
                <span><strong>{i === 0 ? 'Top Pick: ' : ''}{o.name}</strong></span>
                <span className={i === 0 ? 'match-score best' : 'match-score'}>{o.score}% Match</span>
              </div>
              <div className='match-bar'><div className='match-fill' style={{ width: o.score + '%', background: pickHex(o.colour) }} /></div>
              <div className='outfit-match-sub'>{o.pieces}</div>
              {!compact && <div className='outfit-match-why'>{o.why}</div>}
            </button>
          ))}
          {bestOutfit && <div className='outfit-best-note'>Perfect match for you: <strong>{bestOutfit.name}</strong> in <strong>{bestOutfit.colour}</strong> ({bestOutfit.score}%).</div>}
        </div>
      )}
    </div>
  );
}
