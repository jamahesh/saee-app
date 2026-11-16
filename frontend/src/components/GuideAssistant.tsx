import { FormEvent, useState } from 'react';
import { apiFetch } from '../api';
import { ColourLookPreview } from './ColourLookPreview';

type NavTab = 'fit' | 'body' | 'occasion' | 'ads';
type Msg = { role: 'user' | 'bot'; text: string; tab?: string; colours?: string[] };
const TL: Record<string, string> = { fit: 'Fit & Footwear', body: 'Body & Colour', occasion: 'Occasions & Wardrobe', ads: 'Partner Brand Ads' };
const Q = ['Best colours on me', 'Wedding look', 'Quick size tip', 'Show my tone'];

export function GuideAssistant({ tab, profile, onNavigate }: { tab: string; profile: object; onNavigate: (t: NavTab) => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'bot', text: "Hey! I'm Maya, your SAEE stylist. Ask what colours suit you or what to wear." }]);

  async function ask(q: string) {
    const clean = q.trim(); if (!clean || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', text: clean }];
    setMsgs(next); setInput(''); setBusy(true);
    try {
      const r = await apiFetch<{ reply: string; suggested_tab?: string; colours?: string[] }>('/api/assistant/guide', {
        method: 'POST', body: JSON.stringify({ message: clean, tab, profile, history: next.slice(-6) })
      });
      setMsgs([...next, { role: 'bot', text: r.reply, tab: r.suggested_tab, colours: r.colours || [] }]);
    } catch {
      setMsgs([...next, { role: 'bot', text: 'Try Olive Moss or Warm Ivory today, or open Body & Colour.', tab: 'body', colours: ['Olive Moss', 'Terracotta Rust', 'Warm Ivory'] }]);
    } finally { setBusy(false); }
  }

  function onSub(e: FormEvent) { e.preventDefault(); void ask(input); }

  return (
    <>
      <button type='button' className='guide-fab' onClick={() => setOpen((v) => !v)}>{open ? 'Close Stylist' : 'Ask Maya - Stylist'}</button>
      {open && (
        <aside className='guide-panel' aria-label='Personal Stylist Maya'>
          <div className='guide-head'><strong>Maya - Personal Stylist</strong><button type='button' className='btn-secondary' onClick={() => setOpen(false)}>Close</button></div>
          <div className='guide-chips'>{Q.map((q) => <button key={q} type='button' className='chip' onClick={() => void ask(q)}>{q}</button>)}</div>
          <div className='guide-msgs'>
            {msgs.map((m, i) => (
              <div key={i} className={'guide-msg ' + m.role}>
                <div>{m.text}</div>
                {m.colours && m.colours.length > 0 && <ColourLookPreview colours={m.colours} compact />}
                {m.tab && m.tab !== tab && m.tab in TL && <button type='button' className='btn-secondary' style={{ marginTop: 6, fontSize: '0.8rem' }} onClick={() => onNavigate(m.tab as NavTab)}>Open {TL[m.tab]}</button>}
              </div>
            ))}
          </div>
          <form className='guide-form' onSubmit={onSub}><input value={input} onChange={(e) => setInput(e.target.value)} placeholder='Ask Maya (e.g. best colour)...' /><button type='submit' className='btn-primary' disabled={busy}>{busy ? '...' : 'Send'}</button></form>
        </aside>
      )}
    </>
  );
}
