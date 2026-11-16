import { FormEvent, useState } from "react";
import { apiFetch } from "../api";
type TabId="fit"|"body"|"occasion"|"ads";
interface Msg{role:"user"|"bot";text:string;tab?:TabId|null}
const LB:Record<TabId,string>={fit:"Fit & Footwear",body:"Body & Colour + Photo",occasion:"Occasion AI & Wardrobe",ads:"Partner Brand Ads"};
const CH=["How do I measure?","Where do I start?","Best colours for me","Plan a wedding outfit"];
export function GuideAssistant({tab,profile,onNavigate}:{tab:TabId;profile:object;onNavigate:(t:TabId)=>void}){
 const [open,setOpen]=useState(false);const [q,setQ]=useState("");const [busy,setBusy]=useState(false);
 const [ms,setMs]=useState<Msg[]>([{role:"bot",text:"Hi! I am your SAEE AI Style Guide. Ask about measurements, colours, outfits, or how to use any tool."}]);
 async function ask(txt:string){
  const s=txt.trim();if(!s||busy)return;
  const nx=[...ms,{role:"user" as const,text:s}];setMs(nx);setQ("");setBusy(true);
  try{
   const r=await apiFetch<{reply:string;suggested_tab?:TabId|null}>("/api/assistant/guide",{method:"POST",body:JSON.stringify({message:s,tab,profile,history:nx.slice(-6)})});
   setMs([...nx,{role:"bot",text:r.reply,tab:r.suggested_tab}]);
  }catch{setMs([...nx,{role:"bot",text:"Use Fit & Footwear for sizes, Body & Colour for tone palettes, and Occasion AI for outfits.",tab:"fit"}]);}
  finally{setBusy(false);}
 }
 function sub(e:FormEvent){e.preventDefault();void ask(q);}
 return(<>
  <button type="button" className="guide-fab" onClick={()=>setOpen(v=>!v)}>{open?"Close Guide":"AI Style Guide"}</button>
  {open&&(<aside className="guide-panel" aria-label="SAEE AI Style Guide">
   <div className="guide-head"><strong>SAEE AI Style Guide</strong><button type="button" className="btn-secondary" onClick={()=>setOpen(false)}>Close</button></div>
   <div className="guide-chips">{CH.map(c=><button key={c} type="button" className="chip" onClick={()=>void ask(c)}>{c}</button>)}</div>
   <div className="guide-msgs">{ms.map((m,i)=><div key={i} className={"guide-msg "+m.role}><div>{m.text}</div>{m.tab&&m.tab!==tab&&<button type="button" className="btn-secondary" style={{marginTop:6,fontSize:"0.8rem"}} onClick={()=>onNavigate(m.tab!)}>Open {LB[m.tab]} &rarr;</button>}</div>)}</div>
   <form className="guide-form" onSubmit={sub}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Ask for sizing, colour, or app help..."/><button type="submit" className="btn-primary" disabled={busy}>{busy?"...":"Ask"}</button></form>
  </aside>)}
 </>);
}