export type PlanCode = "essential" | "professional" | "studio";

export type User = {
  id: number;
  name: string;
  email: string;
  role?: string;
  plan_code: PlanCode | "none" | string | null;
  plan_status: string;
  plan_active: boolean;
  trial_used: boolean;
  plan_expires_at: string | null;
};

export type PlanInfo = {
  code: PlanCode;
  name: string;
  price_inr: number;
  billing: string;
  tagline: string;
  trial_days?: number;
  trial_eligible?: boolean;
  features: string[];
};

export type PlansResponse = {
  currency: string;
  razorpay_ready: boolean;
  gemini_ready: boolean;
  plans: PlanInfo[];
};

export type SizeResult = {
  best_size: string | null;
  alternative_size: string | null;
  confidence: string;
  explanation: string[];
  ranked_sizes: { size: string; score: number }[];
  chart_verified: boolean;
  warning?: string;
};

export type ProfileData = {
  body_colour: string;
  undertone: string;
  height_cm: number;
  weight_kg: number;
  chest_cm: number;
  waist_cm: number;
  hips_cm: number;
  shoulder_cm: number;
  foot_length_cm: number;
  fit_preference: string;
  style_vibe: string;
};

export type PartnerAd = {
  id: number;
  brand_name: string;
  headline: string;
  offer_text: string;
  category: string;
  target_occasion: string;
  cta_url: string;
  impressions: number;
  clicks: number;
  monthly_budget_inr: number;
};

export type WardrobeItem = {
  id: number;
  title: string;
  category: string;
  color: string;
  occasion: string;
  size_label: string;
  notes: string;
};

export type FamilyMemberInput = {
  label: string;
  body_colour: string;
  undertone: string;
  preferred_fit: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
    };
  }
}
