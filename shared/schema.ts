import { z } from "zod";

export const Rating = z.enum(["High", "Medium", "Low"]);

export const Claim = z.object({
  claim: z.string(),
  evidence_status: z.enum(["Sourced", "Weak", "Missing"]),
  risk: Rating,
  notes: z.string().default(""),
  source_ref: z.string().nullable().default(null),
});

export const Attack = z.object({
  critic: z.enum(["industry", "asa", "media", "public", "ad_owner"]),
  quote: z.string(),
});

export const Risk = z.object({
  issue: z.string(),
  rating: Rating,
  type: z.enum(["regulatory", "reputational", "audience"]),
});

export const Fix = z.object({
  issue: z.string(),
  fix: z.string(),
  sharpest_defensible_version: z.string(),
});

export const VERDICTS = [
  "Ready",
  "Ready with minor fixes",
  "Needs changes",
  "High risk, get legal review",
] as const;

export const Report = z.object({
  summary: z.string(),
  claims: z.array(Claim).default([]),
  attacks: z.array(Attack).default([]),
  risks: z.array(Risk).default([]),
  fixes: z.array(Fix).default([]),
  working: z.array(z.string()).default([]),
  verdict: z.enum(VERDICTS),
  // The model's own verdict, kept when the code-computed verdict differs.
  model_verdict: z.enum(VERDICTS).optional(),
  legal_flags: z.array(z.string()).default([]),
  // Filled by the server, not the model.
  unverified_citations: z.array(z.string()).default([]),
});
export type Report = z.infer<typeof Report>;

/** Verdict derived from the risk list, so it always agrees with the table. */
export function computeVerdict(risks: { rating: string; type: string }[]): (typeof VERDICTS)[number] {
  if (risks.some((r) => r.rating === "High" && r.type === "regulatory")) return "High risk, get legal review";
  if (risks.some((r) => r.rating === "High")) return "Needs changes";
  if (risks.some((r) => r.rating === "Medium")) return "Ready with minor fixes";
  return "Ready";
}

export interface Usage {
  prompt_tokens: number;
  cached_tokens: number;
  completion_tokens: number;
  cost: number | null;
}

export type Effort = "low" | "medium" | "high";
export type ModelChoice = "default" | "deep";

export interface FileUpload {
  name: string;
  mime: string;
  data: string; // base64, no data: prefix
}

export interface ReviewRequest {
  text: string;
  files: FileUpload[];
  campaign: string;
  placement: string;
  audience: string;
  model: ModelChoice;
  effort: Effort;
}

export interface ReviewResponse {
  report: Report;
  usage: Usage;
  model: string;
  saved_as: string;
}

// What the client receives. Usage and saved path stay server-side (logged and saved in the review JSON).
export interface ReviewResult {
  report: Report;
}

export interface Config {
  models: Record<ModelChoice, string>;
}
