import { FormEvent, useState } from "react";
import { apiFetch } from "../api";
interface AdItem{id:number;brand_name:string;headline:string;offer_text:string;category:string;target_occasion:string;monthly_budget_inr:number;impressions:number;clicks:number}
export function AdsAndPlans({ads,onRefreshAds,onMessage}:{ads:AdItem[];onRefreshAds:()=>void;onMessage:(k:"ok"|"warn"|"err",t:string)=>void;[k:string]:unknown}){
 const [loading,setLoading]=useState(false);
 const [brandName,setBrandName]=useState("");
 const [headline,setHeadline]=useState("");
 const [offerText,setOfferText]=useState("");
 const [category,setCategory]=useState("Occasionwear");
 const [targetOccasion,setTargetOccasion]=useState("Birthday");
 const [ctaUrl,setCtaUrl]=useState("https://saee-fashion.web.app");
 const [budget,setBudget]=useState("10000");
 async function submitAd(e:FormEvent){
  e.preventDefault();setLoading(true);
  try{
   await apiFetch("/api/ads",{method:"POST",body:JSON.stringify({brand_name:brandName,headline,offer_text:offerText,category,target_occasion:targetOccasion,cta_url:ctaUrl,monthly_budget_inr:Number(budget)||5000})});
   setBrandName("");setHeadline("");setOfferText("");onRefreshAds();onMessage("ok","Partner brand campaign is live in SAEE!");
  }catch(err){onMessage("err",err instanceof Error?err.message:"Could not publish ad.");}finally{setLoading(false);}
 }
 return(
  <div className="grid-2">
   <div className="card">
    <h2>Active Partner Brand Ads</h2>
    <p className="muted">Featured campaigns from SAEE partner fashion houses.</p>
    {ads.map(ad=>(
     <div key={ad.id} className="result-box">
      <div className="ad-tag">{ad.category} &middot; {ad.target_occasion}</div>
      <strong>{ad.brand_name}</strong>: {ad.headline}
      <p className="muted" style={{margin:"6px 0"}}>{ad.offer_text}</p>
      <small className="muted">Budget: INR {ad.monthly_budget_inr}/mo &middot; Impressions: {ad.impressions} &middot; Clicks: {ad.clicks}</small>
     </div>
    ))}
   </div>
   <div className="card">
    <h2>Partner Brand Campaign Studio</h2>
    <p className="muted">Publish sponsored brand campaigns directly in SAEE.</p>
    <form onSubmit={submitAd}>
     <div className="field"><label>Brand Name</label><input value={brandName} onChange={e=>setBrandName(e.target.value)} required placeholder="e.g., Zari & Co"/></div>
     <div className="field"><label>Campaign Headline</label><input value={headline} onChange={e=>setHeadline(e.target.value)} required placeholder="e.g., Custom Tailored Linen Sets"/></div>
     <div className="field"><label>Offer Text</label><input value={offerText} onChange={e=>setOfferText(e.target.value)} required placeholder="e.g., 20% off for SAEE members"/></div>
     <div className="form-grid">
      <div className="field"><label>Category</label><input value={category} onChange={e=>setCategory(e.target.value)} required/></div>
      <div className="field"><label>Target Occasion</label><input value={targetOccasion} onChange={e=>setTargetOccasion(e.target.value)} required/></div>
      <div className="field"><label>Landing URL</label><input value={ctaUrl} onChange={e=>setCtaUrl(e.target.value)} required/></div>
      <div className="field"><label>Monthly Budget (INR)</label><input type="number" min={1000} value={budget} onChange={e=>setBudget(e.target.value)} required/></div>
     </div>
     <button type="submit" className="btn-primary" disabled={loading}>Publish Partner Ad</button>
    </form>
   </div>
  </div>
 );
}
export default AdsAndPlans;