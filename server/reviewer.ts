import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import {
  Report,
  COPY_ADVICE_TODO,
  computeReportVerdict,
  computeVerdictAfterTodos,
  type ReviewRequest,
  type ReviewResponse,
  type Usage,
} from "../shared/schema.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROMPT_FILE = path.join(ROOT, "prompts", "red-team-context.md");
const REFERENCE_DIR = path.join(ROOT, "reference");
const REVIEWS_DIR = path.join(ROOT, "reviews");

export const MODELS = {
  default: process.env.MODEL_DEFAULT || "anthropic/claude-sonnet-5.5",
  deep: process.env.MODEL_DEEP || "anthropic/claude-opus-5.5",
};

const OUTPUT_SPEC = `

---

## Output format (strict)
Respond with a single JSON object and nothing else (no markdown fences, no commentary).
Exact shape:
{
  "bottom_line": string,
  "tabs": {
    "regulators": {
      "assessment": string,
      "issues": [ISSUE],
      "todo": [TODO],
      "claims": [{"claim": string, "claim_kind": "factual"|"opinion"|"rhetoric", "evidence_status": "Sourced"|"Weak"|"Missing"|"Not checked", "notes": string, "rules": [string], "source_ref": <exact reference doc name> or null}],
      "legal_flags": [string]
    },
    "public": {"assessment": string, "issues": [ISSUE], "todo": [TODO]},
    "industry": {"assessment": string, "issues": [ISSUE], "todo": [TODO]}
  },
  "working": [string],
  "verdict": "Ready"|"Ready with minor fixes"|"Needs changes"|"High risk, get legal review"
}
ISSUE = {"id": string, "title": string, "detail": string, "rating": "High"|"Medium"|"Low", "ad_quote": the ad's exact words or null, "rules": [string], "fixable_by_evidence": boolean}
TODO = {"action": string, "type": "hold evidence"|"reword"|"get approval"|"prepare response", "issue_ids": [string], "detail": string, "where": "keep on file"|"keep on file + publish on website (recommended)" or null, "suggested_wording": string or null, "likely_attack": string or null, "suggested_reply": string or null, "rules": [string], "approver": string or null, "approver_known": boolean}

Rules: never invent rulings or sources. Only cite rulings that appear in the reference docs, and set source_ref to the exact doc name (or null). If nothing in the docs supports a claim, say so in notes. Sort issues High first.

Tabs (each audience appears once; do not repeat points across tabs):
- regulators: the ASA/CAP, and media owners (TfL, Global and similar). Media-owner concerns go here.
- public: the general public, supporters and the press. Issues are likely reactions.
- industry: the industry, trade bodies and critics. Issues are likely reactions.
- Each issue appears once, in the most relevant tab. Todos refer to issues by issue_ids and do not restate them. Issue ids are unique across the whole report: r1, r2... for regulators, p1... for public, i1... for industry.
- If the industry will attack a claim the ASA might also judge, put the regulatory issue in regulators and only the attack and reply in industry (a "prepare response" todo, plus an industry issue only if the attack is a separate point).
- Public and industry issues are anticipated reactions, not predictions. Keep them specific to this ad. If there is nothing specific to say, return an empty issues list.
- Todo fields: "where" only for "hold evidence" (else null). "suggested_wording" only for "reword": the sharpest defensible version. "likely_attack" and "suggested_reply" only for "prepare response". Unused fields are null.

Evidence and todo rules:
- Assess the ad as submitted. Missing evidence is an issue: set fixable_by_evidence = true (regulators tab only) and add a "hold evidence" todo. Use evidence_status "Not checked" when no source has been provided.
- CAP 3.7 means the advertiser must HOLD evidence, not show it on the ad. Never suggest adding citations, footnotes or sources to the ad; posters are meant to be minimal.
- If a claim goes beyond what any credible source could support (as in the Viva! "linked to cancer" ruling), set fixable_by_evidence = false: the todo is "reword".
- Distress, offence and imagery issues are never fixable by evidence (fixable_by_evidence = false).
- Only add a "hold evidence" or "get approval" todo if holding evidence or approval would fix the issue. A claim that needs rewording gets a "reword" todo only.
- Approval todos ("get approval") have empty rules (they are not CAP rules; do not tag them CAP 1.8 or similar), an "approver" (short name) and "approver_known". Both are null/false for other todo types. Name the approver in the action, e.g. "Get TfL approval of the final artwork".
- Legal review is a "get approval" todo with approver "a lawyer" and approver_known true.
- Media-owner approval comes from the Placement field in the request. Never guess an owner the placement doesn't imply:
  - London Underground -> approver "TfL", approver_known true.
  - Facebook or Instagram ads -> "Meta's ad review"; YouTube or Google ads -> "Google's ad review"; TikTok ads -> "TikTok's ad review" (approver_known true).
  - Placement known but owner not (e.g. "billboard", "bus stop") -> approver "the site owner (e.g. Global, JCDecaux, Clear Channel)", approver_known false.
  - Placement blank or unclear -> approver "the media owner or platform (e.g. TfL, Global, Meta's ad review)", approver_known false.
  - Own channels (own website, organic posts on the advertiser's own accounts) -> no media-owner approval todo; at most a low-priority note to check the platform's community guidelines.
- Each "hold evidence" detail must be specific: what the source must show to match how the ad will be read (scope, date, region, exact wording). Example: "a UK-wide, post-2020 source showing 90% of pigs...; if it says 'up to' or 'England', reword the claim".
- Never tell users to "cite" a source or "add a source" in a way that implies putting it on the ad. Say "hold" or "keep on file" instead.
- A line that attributes words to someone ("They say...", "The industry calls it...") is a factual claim that they said it: claim_kind "factual", not "rhetoric".
- One issue per problem. Never combine an evidence problem (fixable_by_evidence = true) with a wording or caveat problem (false) in one issue; split them. Example: "90% stat needs a source" (true) vs "90% may only apply to England; the ad says UK" (false: reword or add a caveat on the ad). Only raise the wording or caveat issue if there is a real reason to suspect it, not as a generic possibility.
- Every regulators issue must be referenced by at least one todo (via issue_ids), unless it genuinely can't be fixed (e.g. the core concept is the problem). In that case say so in the issue detail.
- Do not add a Copy Advice todo; the system adds it.
- Use "keep on file + publish on website (recommended)" for headline stats and quotes likely to be challenged publicly; otherwise "keep on file".
- In free text, name rulings (e.g. "the ASA ruling on Viva!"). Never mention the "reference pack", file names, or tool internals.

Bottom line:
- bottom_line gives your judgement and the main action. Do not describe the ad; the user knows it. Example: "A strong, defensible ad. Before launch, get sources on file for the 90% figure and the committee quote, and be ready for the industry to say CO2 stunning is legal."

Issue titles:
- Plain statements a campaigner understands at a glance, max about 10 words. Examples: "The 90% figure needs a UK-wide source on file", "'Gas chambers' may offend some people", "Expect 'it's legal, approved and being phased out'".

Plain English rules:
- Write for a campaigner, not a lawyer. Short sentences, no jargon.
- Name things specifically: quote the ad's exact words, and name the body or source (e.g. "the Animal Welfare Committee, which advises the government") rather than "the committee" or "the claim".
- No generic hedging (e.g. "may be selective, out of context or outdated"). State the specific concern and why, or leave it out.
- Say what to do, not just the rule. Example: "Check the quote matches the report word for word, and avoid wording that suggests the committee supports your campaign."
- Never put rule numbers in sentences. Put them in the "rules" array on issues, claims and todos, in the form ["CAP 3.47", "CAP 3.52"] (empty array if none). Any regulators issue that could break a CAP rule (misleading, distress, offence, harm) must name that rule in "rules".

CAP Section 3 focus. For campaign ads, apply only these rules and ignore the rest of Section 3 (prices, availability, competitor comparisons, reviews, guarantees):
- Judge the overall impression and likely effect on viewers, not intent.
- 3.1: the ad must not materially mislead.
- 3.2: obvious rhetoric or exaggeration people won't take literally is allowed. Don't demand evidence for it (claim_kind "rhetoric").
- 3.6: opinions ("cruel", "wrong") are fine if clearly opinion (claim_kind "opinion"). Flag only an opinion presented as fact.
- 3.7: factual claims (claim_kind "factual") need evidence HELD before launch, not shown on the ad. Only factual claims get missing-evidence issues or "hold evidence" todos.
- 3.3: for space-limited formats such as posters, supporting detail on the linked website counts in the advertiser's favour.
- 3.9/3.10: if a claim is only accurate with a caveat (scope, region, date, "up to"), the caveat must be on the ad, clearly. A website can't fix a headline that is misleading without its caveat. This is a "reword" todo, not "hold evidence".
- 3.13: don't present contested science as settled; suggest attributing it ("X found...") instead.
- 3.5: the ad must make clear who is behind it (name, logo or URL).
- 3.47/3.50: quotes need proof they are genuine and accurate; quotes from published sources don't need permission.
- 3.52: quoting a public body must not imply it endorses the campaign.
- 3.51: never suggest saying the ad is ASA/CAP approved.
- 3.23-3.26: apply only if the ad offers something "free".

legal_flags: short "check with a lawyer if..." items (e.g. defamation if naming companies, charity campaigning rules, election-period rules). Only when relevant to this ad; otherwise an empty list.

Length limits (strict):
- bottom_line: 1-2 sentences. assessment: max 2 sentences.
- At most 4 issues per tab, highest-impact first; merge minor points. At most 6 todos per tab.
- issue.title: max 10 words. issue.detail: max 30 words.
- todo.action: max 15 words. todo.detail and suggested_wording: max 25 words each. suggested_reply: max 30 words. likely_attack: max 25 words.
- claims[].notes: max 20 words.
- working: max 5 items, one line each.
- No preamble, reasoning or any text outside the JSON object.
`;

export class ReviewError extends Error {}

async function pdfText(data: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

export async function loadReferenceDocs(): Promise<Record<string, string>> {
  const docs: Record<string, string> = {};
  let names: string[] = [];
  try {
    names = (await fs.readdir(REFERENCE_DIR, { recursive: true }))
      .map((n) => n.split(path.sep).join("/"))
      .sort();
  } catch {}
  for (const name of names) {
    const ext = path.extname(name).toLowerCase();
    const full = path.join(REFERENCE_DIR, name);
    if (ext === ".md" || ext === ".txt") docs[name] = await fs.readFile(full, "utf8");
    else if (ext === ".pdf") docs[name] = await pdfText(await fs.readFile(full));
  }
  return docs;
}

async function buildSystem(docs: Record<string, string>) {
  const prompt = await fs.readFile(PROMPT_FILE, "utf8");
  const ref = Object.entries(docs)
    .map(([n, t]) => `<doc name="${n}">\n${t}\n</doc>`)
    .join("\n\n");
  return [
    { type: "text", text: prompt + OUTPUT_SPEC },
    {
      type: "text",
      text: "# Reference pack\n\n" + (ref || "(no reference documents loaded)"),
      cache_control: { type: "ephemeral" },
    },
  ];
}

async function buildUser(req: ReviewRequest) {
  const meta = [
    req.campaign && `Campaign name: ${req.campaign}`,
    req.placement && `Placement: ${req.placement}`,
    req.audience && `Target audience: ${req.audience}`,
  ].filter(Boolean) as string[];
  const parts = ["Review this submission.", ...meta];
  if (req.text.trim()) parts.push(`<submission_text>\n${req.text.trim()}\n</submission_text>`);
  const images: unknown[] = [];
  for (const f of req.files) {
    if (f.mime === "application/pdf") {
      const text = await pdfText(Buffer.from(f.data, "base64"));
      parts.push(`<submission_pdf name="${f.name}">\n${text}\n</submission_pdf>`);
    } else if (f.mime.startsWith("image/")) {
      images.push({ type: "image_url", image_url: { url: `data:${f.mime};base64,${f.data}` } });
    }
  }
  return [{ type: "text", text: parts.join("\n") }, ...images];
}

function extractJson(raw: string): unknown {
  const s = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(s);
  } catch (e) {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a === -1 || b <= a) throw e;
    return JSON.parse(s.slice(a, b + 1));
  }
}

/** Flags source_refs that match no reference file, and ruling names absent from the pack. */
export function checkCitations(report: Report, docs: Record<string, string>): string[] {
  const problems = new Set<string>();
  for (const c of report.tabs.regulators.claims) {
    if (c.source_ref && !(c.source_ref.replaceAll("\\", "/") in docs))
      problems.add(`source_ref '${c.source_ref}' does not match any file in reference/ (use the relative path, e.g. rulings/peta-2023-08.md)`);
  }
  const corpus = Object.values(docs).join("\n").toLowerCase();
  const texts = [
    report.bottom_line,
    ...report.tabs.regulators.claims.map((c) => c.notes),
    ...report.tabs.regulators.legal_flags,
    ...Object.values(report.tabs).flatMap((tab) => [
      tab.assessment,
      ...tab.issues.map((i) => i.detail),
      ...tab.todo.map((d) => d.detail),
    ]),
  ];
  const re = /ASA ruling (?:on|against)\s+([A-Z][\w&'.\- ]{2,60})/g;
  for (const t of texts)
    for (const m of t.matchAll(re)) {
      const name = m[1].trim().replace(/\.$/, "");
      if (!corpus.includes(name.toLowerCase()))
        problems.add(`Ruling '${name}' is not in reference/, treat as unverified`);
    }
  return [...problems].sort();
}

function client() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new ReviewError("OPENROUTER_API_KEY not set. Add it to .env.");
  return new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });
}

function toUsage(u: any): Usage {
  return {
    prompt_tokens: u?.prompt_tokens ?? 0,
    cached_tokens: u?.prompt_tokens_details?.cached_tokens ?? 0,
    completion_tokens: u?.completion_tokens ?? 0,
    cost: typeof u?.cost === "number" ? u.cost : null,
  };
}

const addUsage = (a: Usage, b: Usage): Usage => ({
  prompt_tokens: a.prompt_tokens + b.prompt_tokens,
  cached_tokens: a.cached_tokens + b.cached_tokens,
  completion_tokens: a.completion_tokens + b.completion_tokens,
  cost: a.cost == null || b.cost == null ? (a.cost ?? b.cost) : a.cost + b.cost,
});

export async function runReview(
  req: ReviewRequest,
  opts: { save?: boolean } = {},
): Promise<ReviewResponse> {
  if (!req.text.trim() && !req.files.length) throw new ReviewError("Nothing to review.");
  const model = MODELS[req.model] ?? MODELS.default;
  const docs = await loadReferenceDocs();
  const messages: any[] = [
    { role: "system", content: await buildSystem(docs) },
    { role: "user", content: await buildUser(req) },
  ];
  const ai = client();
  let usage: Usage = { prompt_tokens: 0, cached_tokens: 0, completion_tokens: 0, cost: 0 };
  let lastErr = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await ai.chat.completions.create({
      model,
      messages,
      max_tokens: 16000,
      reasoning_effort: req.effort,
      provider: { order: ["anthropic"], allow_fallbacks: false },
      usage: { include: true },
    } as any);
    usage = addUsage(usage, toUsage(resp.usage));
    const raw = resp.choices[0]?.message?.content ?? "";
    let parsed: { ok: true; data: Report } | { ok: false; error: string };
    try {
      const r = Report.safeParse(extractJson(raw));
      parsed = r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.message };
    } catch (e) {
      parsed = { ok: false, error: String(e) };
    }
    if (parsed.ok) {
      const { tabs } = parsed.data;
      const verdict = computeReportVerdict(tabs);
      const todo = tabs.regulators.todo.some((d) => /copy advice/i.test(d.action))
        ? tabs.regulators.todo
        : [...tabs.regulators.todo, { ...COPY_ADVICE_TODO }];
      const report: Report = {
        ...parsed.data,
        tabs: { ...tabs, regulators: { ...tabs.regulators, todo } },
        verdict,
        model_verdict: parsed.data.verdict !== verdict ? parsed.data.verdict : undefined,
        verdict_after_todos: computeVerdictAfterTodos(tabs),
        unverified_citations: checkCitations(parsed.data, docs),
      };
      const saved_as = opts.save === false ? "" : await saveReport(report, req, model, usage);
      return { report, usage, model, saved_as };
    }
    lastErr = parsed.error;
    messages.push(
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `That was not valid against the schema (${lastErr.slice(0, 800)}). Reply again with only the corrected JSON object.`,
      },
    );
  }
  throw new ReviewError(`Model returned invalid JSON twice: ${lastErr.slice(0, 300)}`);
}

async function saveReport(report: Report, req: ReviewRequest, model: string, usage: Usage): Promise<string> {
  await fs.mkdir(REVIEWS_DIR, { recursive: true });
  const slug =
    req.campaign.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) ||
    "review";
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const name = `${ts}_${slug}.json`;
  const payload = {
    model,
    effort: req.effort,
    usage,
    campaign: req.campaign,
    placement: req.placement,
    audience: req.audience,
    ...report,
  };
  await fs.writeFile(path.join(REVIEWS_DIR, name), JSON.stringify(payload, null, 2), "utf8");
  return `reviews/${name}`;
}
