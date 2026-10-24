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

export const ITEM_TYPES = ["hold evidence", "reword", "get approval", "prepare response", "rethink"] as const;
export const EVIDENCE_WHERE = ["keep on file", "keep on file + publish on website (recommended)"] as const;

// One problem and its action, together.
export const Item = z.object({
  id: z.string(),
  // Plain title of what to do, e.g. "Hold a UK-wide source for the 90% figure".
  action: z.string(),
  type: z.enum(ITEM_TYPES),
  rating: Rating,
  // The ad's exact words that the item is about.
  ad_quote: z.string().nullable().default(null),
  // What is needed.
  detail: z.string().default(""),
  // Extra context on the problem; null if the action and detail already cover it.
  why: z.string().nullable().default(null),
  // hold evidence only
  where: z.enum(EVIDENCE_WHERE).nullable().default(null),
  // reword only: the sharpest defensible version
  suggested_wording: z.string().nullable().default(null),
  // prepare response only
  likely_attack: z.string().nullable().default(null),
  suggested_reply: z.string().nullable().default(null),
  // get approval only: who approves, and whether the placement tells us (e.g. "TfL", "a lawyer").
  approver: z.string().nullable().default(null),
  approver_known: z.boolean().default(false),
  rules: z.array(z.string()).default([]),
  // Past ASA rulings the item draws on (name and the Link from the ruling card).
  rulings: z.array(z.object({ name: z.string(), url: z.string() })).default([]),
});

export const Tab = z.object({
  assessment: z.string(),
  items: z.array(Item).default([]),
});

export const RegulatorsTab = Tab.extend({
  claims: z.array(Claim).default([]),
  legal_flags: z.array(z.string()).default([]),
});

export const TAB_KEYS = ["regulators", "public", "industry"] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export const COPY_ADVICE_ITEM = {
  id: "copy-advice",
  action: "Get a free pre-launch check from CAP's Copy Advice service",
  type: "get approval",
  rating: "Low",
  ad_quote: null,
  detail: "Ask for written advice on the final version. Don't describe the ad as ASA/CAP approved afterwards.",
  why: null,
  where: null,
  suggested_wording: null,
  likely_attack: null,
  suggested_reply: null,
  approver: "CAP Copy Advice",
  approver_known: true,
  rules: [] as string[],
  rulings: [] as { name: string; url: string }[],
} as const;

export const isCopyAdvice = (i: { action: string }) => /copy advice/i.test(i.action);

export const VERDICTS = [
  "Ready",
  "Ready with minor fixes",
  "Needs changes",
  "High risk, get legal review",
] as const;

export const HEADLINES = ["High risk", "Needs changes", "Nearly ready", "Ready to launch"] as const;

export const Report = z.object({
  bottom_line: z.string(),
  tabs: z.object({
    regulators: RegulatorsTab,
    public: Tab,
    industry: Tab,
  }),
  working: z.array(z.string()).default([]),
  verdict: z.enum(VERDICTS),
  // Filled by the server: the short headline shown first (see computeHeadline).
  headline: z.enum(HEADLINES).optional(),
  // The model's own verdict, kept when the code-computed verdict differs.
  model_verdict: z.enum(VERDICTS).optional(),
  // Filled by the server: the verdict once every reword, hold-evidence and get-approval item is done.
  verdict_after_todos: z.enum(VERDICTS).optional(),
  // Filled by the server, not the model.
  unverified_citations: z.array(z.string()).default([]),
});
export type Report = z.infer<typeof Report>;
export type Item = z.infer<typeof Item>;

/** Verdict derived from the risk list, so it always agrees with what is shown. */
export function computeVerdict(risks: { rating: string; type: string }[]): (typeof VERDICTS)[number] {
  if (risks.some((r) => r.rating === "High" && r.type === "regulatory")) return "High risk, get legal review";
  if (risks.some((r) => r.rating === "High")) return "Needs changes";
  if (risks.some((r) => r.rating === "Medium")) return "Ready with minor fixes";
  return "Ready";
}

const CAP_RULE = /B?CAP/i;

/** Item types that are done by the time of launch; "rethink" and "prepare response" stay. */
const DONE_TYPES = new Set<string>(["reword", "hold evidence", "get approval"]);

/**
 * Flatten all tabs to risks. Only regulators items that cite a CAP/BCAP rule are regulatory;
 * public and industry items never are. With `afterTodos`, reword, hold-evidence and get-approval
 * items are left out.
 */
export function tabRisks(tabs: Report["tabs"], afterTodos = false) {
  const keep = (i: Item) => !(afterTodos && DONE_TYPES.has(i.type));
  return [
    ...tabs.regulators.items.filter(keep).map((i) => ({
      rating: i.rating,
      type: i.rules.some((r) => CAP_RULE.test(r)) ? "regulatory" : "reputational",
    })),
    ...[...tabs.public.items, ...tabs.industry.items].filter(keep).map((i) => ({
      rating: i.rating,
      type: "reputational",
    })),
  ];
}

export const computeReportVerdict = (tabs: Report["tabs"]) => computeVerdict(tabRisks(tabs));

/** Verdict once every reword, hold-evidence and get-approval item is done. */
export const computeVerdictAfterTodos = (tabs: Report["tabs"]) => computeVerdict(tabRisks(tabs, true));

/**
 * The short headline verdict, from the tab items (the optional Copy Advice check is ignored):
 * - High risk: any "rethink" item, or any High regulatory item that is not a reword, hold-evidence,
 *   get-approval or prepare-response item
 * - Needs changes: any reword item rated High or Medium
 * - Nearly ready: hold-evidence, get-approval or Low reword items left, or any prepare-response item
 *   rated High or Medium (these never raise the headline above this)
 * - Ready to launch: none of the above
 */
export function computeHeadline(tabs: Report["tabs"]): (typeof HEADLINES)[number] {
  const regulators = tabs.regulators.items.filter((i) => !isCopyAdvice(i));
  const all = [...regulators, ...tabs.public.items, ...tabs.industry.items];
  const isRegulatory = (i: Item) => regulators.includes(i) && i.rules.some((r) => CAP_RULE.test(r));
  const blocking = (i: Item) => !DONE_TYPES.has(i.type) && i.type !== "prepare response";
  if (all.some((i) => i.type === "rethink" || (i.rating === "High" && isRegulatory(i) && blocking(i))))
    return "High risk";
  if (all.some((i) => i.type === "reword" && i.rating !== "Low")) return "Needs changes";
  if (
    all.some(
      (i) =>
        i.type === "hold evidence" ||
        i.type === "get approval" ||
        i.type === "reword" ||
        (i.type === "prepare response" && i.rating !== "Low"),
    )
  )
    return "Nearly ready";
  return "Ready to launch";
}

const RATING_RANK = { High: 0, Medium: 1, Low: 2 } as const;

/** The items that count for a tab's rating: all except the optional Copy Advice check. */
export const ratedItems = (items: Item[]) => items.filter((i) => !isCopyAdvice(i));

/** Items highest rating first (stable). */
export const sortItems = (items: Item[]) => [...items].sort((a, b) => RATING_RANK[a.rating] - RATING_RANK[b.rating]);

/** Highest rating among a tab's items, or null if it has none. */
export function tabRating(items: Item[]): keyof typeof RATING_RANK | null {
  return sortItems(ratedItems(items))[0]?.rating ?? null;
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

/**
 * What to do before launch, from the items: lines to reword, sources to hold, who has to approve,
 * and High or Medium attacks to prepare a response for. Copy Advice is not counted.
 */
export function pathToVerdict(report: Report) {
  const items = Object.values(report.tabs).flatMap((tab) => tab.items);
  // High and Medium rewords are required; Low ones are suggestions.
  const rewords = items.filter((d) => d.type === "reword" && d.rating !== "Low").length;
  const suggestedRewords = items.filter((d) => d.type === "reword" && d.rating === "Low").length;
  const sources = items.filter((d) => d.type === "hold evidence").length;
  const responses = items.filter((d) => d.type === "prepare response" && d.rating !== "Low").length;
  const approvers: string[] = [];
  for (const d of items) {
    if (d.type !== "get approval" || isCopyAdvice(d)) continue;
    const who = d.approver_known && d.approver ? d.approver : "the media owner";
    if (!approvers.includes(who)) approvers.push(who);
  }
  return { rewords, suggestedRewords, sources, approvers, responses };
}

/** "A", "A and B", "A, B and C". */
export function joinAnd(xs: string[]): string {
  return xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : (xs[0] ?? "");
}
