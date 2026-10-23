import { z } from "zod";

export const Rating = z.enum(["High", "Medium", "Low"]);

export const CLAIM_KINDS = ["factual", "opinion", "rhetoric"] as const;

export const Claim = z.object({
  claim: z.string(),
  // Only factual claims need evidence.
  claim_kind: z.enum(CLAIM_KINDS).default("factual"),
  evidence_status: z.enum(["Sourced", "Weak", "Missing", "Not checked"]),
  notes: z.string().default(""),
  rules: z.array(z.string()).default([]),
  source_ref: z.string().nullable().default(null),
});

export const Issue = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  rating: Rating,
  // The ad's exact words that the issue is about.
  ad_quote: z.string().nullable().default(null),
  rules: z.array(z.string()).default([]),
  // True if holding the right evidence or sign-off would remove this issue (regulators tab only).
  fixable_by_evidence: z.boolean().default(false),
});

export const TODO_TYPES = ["hold evidence", "reword", "get sign-off", "prepare response"] as const;
export const EVIDENCE_WHERE = ["keep on file", "keep on file + publish on website (recommended)"] as const;

export const Todo = z.object({
  action: z.string(),
  type: z.enum(TODO_TYPES),
  issue_ids: z.array(z.string()).default([]),
  detail: z.string().default(""),
  // hold evidence only
  where: z.enum(EVIDENCE_WHERE).nullable().default(null),
  // reword only: the sharpest defensible version
  suggested_wording: z.string().nullable().default(null),
  // prepare response only
  likely_attack: z.string().nullable().default(null),
  suggested_reply: z.string().nullable().default(null),
  rules: z.array(z.string()).default([]),
});

export const Tab = z.object({
  assessment: z.string(),
  issues: z.array(Issue).default([]),
  todo: z.array(Todo).default([]),
});

export const RegulatorsTab = Tab.extend({
  claims: z.array(Claim).default([]),
  legal_flags: z.array(z.string()).default([]),
});

export const TAB_KEYS = ["regulators", "public", "industry"] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export const COPY_ADVICE_TODO = {
  action: "Get a free pre-launch check from CAP's Copy Advice service",
  type: "get sign-off",
  issue_ids: [] as string[],
  detail: "Ask for written advice on the final version. Don't describe the ad as ASA/CAP approved afterwards.",
  where: null,
  suggested_wording: null,
  likely_attack: null,
  suggested_reply: null,
  rules: [] as string[],
} as const;

export const VERDICTS = [
  "Ready",
  "Ready with minor fixes",
  "Needs changes",
  "High risk, get legal review",
] as const;

export const Report = z.object({
  summary: z.string(),
  tabs: z.object({
    regulators: RegulatorsTab,
    public: Tab,
    industry: Tab,
  }),
  working: z.array(z.string()).default([]),
  verdict: z.enum(VERDICTS),
  // The model's own verdict, kept when the code-computed verdict differs.
  model_verdict: z.enum(VERDICTS).optional(),
  // Filled by the server: the verdict once every evidence-fixable issue is resolved.
  verdict_after_checklist: z.enum(VERDICTS).optional(),
  // Filled by the server, not the model.
  unverified_citations: z.array(z.string()).default([]),
});
export type Report = z.infer<typeof Report>;
export type Issue = z.infer<typeof Issue>;
export type Todo = z.infer<typeof Todo>;

/** Verdict derived from the risk list, so it always agrees with what is shown. */
export function computeVerdict(risks: { rating: string; type: string }[]): (typeof VERDICTS)[number] {
  if (risks.some((r) => r.rating === "High" && r.type === "regulatory")) return "High risk, get legal review";
  if (risks.some((r) => r.rating === "High")) return "Needs changes";
  if (risks.some((r) => r.rating === "Medium")) return "Ready with minor fixes";
  return "Ready";
}

const CAP_RULE = /B?CAP/i;

/**
 * Flatten all tabs to risks. Only regulators issues that cite a CAP/BCAP rule are regulatory;
 * public and industry issues never are. With `afterChecklist`, regulators issues that holding
 * evidence would remove are ignored.
 */
export function tabRisks(tabs: Report["tabs"], afterChecklist = false) {
  return [
    ...tabs.regulators.issues
      .filter((i) => !(afterChecklist && i.fixable_by_evidence))
      .map((i) => ({
        rating: i.rating,
        type: i.rules.some((r) => CAP_RULE.test(r)) ? "regulatory" : "reputational",
      })),
    ...[...tabs.public.issues, ...tabs.industry.issues].map((i) => ({ rating: i.rating, type: "reputational" })),
  ];
}

export const computeReportVerdict = (tabs: Report["tabs"]) => computeVerdict(tabRisks(tabs));
export const computeVerdictAfterChecklist = (tabs: Report["tabs"]) => computeVerdict(tabRisks(tabs, true));

const RATING_RANK = { High: 0, Medium: 1, Low: 2 } as const;

/** Highest issue rating in a tab, or null if it has no issues. */
export function tabRating(issues: { rating: keyof typeof RATING_RANK }[]): keyof typeof RATING_RANK | null {
  return issues.reduce<keyof typeof RATING_RANK | null>(
    (best, i) => (best === null || RATING_RANK[i.rating] < RATING_RANK[best] ? i.rating : best),
    null,
  );
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
