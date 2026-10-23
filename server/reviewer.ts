import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import {
  Report,
  computeVerdict,
  computeVerdictAfterChecklist,
  COPY_ADVICE_ITEM,
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
  "summary": string,
  "claims": [{"claim": string, "claim_kind": "factual"|"opinion"|"rhetoric", "evidence_status": "Sourced"|"Weak"|"Missing"|"Not checked", "risk": "High"|"Medium"|"Low", "notes": string, "rules": [string], "source_ref": <exact reference doc name> or null}],
  "attacks": [{"critic": "industry"|"asa"|"media"|"public"|"ad_owner", "quote": string}],
  "risks": [{"issue": string, "rating": "High"|"Medium"|"Low", "type": "regulatory"|"reputational"|"audience", "fixable_by_evidence": boolean, "rules": [string]}],
  "fixes": [{"issue": string, "fix": string, "sharpest_defensible_version": string}],
  "checklist": [{"item": string, "where": "keep on file"|"keep on file + publish on website (recommended)"|"get sign-off", "related_claim": string or null, "why": string, "evidence_needed": string, "rules": [string]}],
  "working": [string],
  "verdict": "Ready"|"Ready with minor fixes"|"Needs changes"|"High risk, get legal review",
  "legal_flags": [string]
}
Rules: never invent rulings or sources. Only cite rulings that appear in the reference docs, and set source_ref to the exact doc name (or null). If nothing in the docs supports a claim, say so in notes. Sort risks High first.

Evidence and checklist rules:
- Assess the ad as submitted. Missing evidence counts as a risk, but set fixable_by_evidence = true on it and add a checklist item. Use evidence_status "Not checked" when no source has been provided.
- CAP 3.7 means the advertiser must HOLD evidence, not show it on the ad. Never suggest adding citations, footnotes or sources to the ad; posters are meant to be minimal.
- If a claim goes beyond what any credible source could support (as in the Viva! "linked to cancer" ruling), set fixable_by_evidence = false: the fix is rewording.
- Distress, offence and imagery risks are never fixable by evidence (fixable_by_evidence = false).
- Media-owner acceptance and legal sign-off are not CAP rules: leave "rules" empty on those checklist items (do not tag them CAP 1.8 or similar).
- Never tell users to "cite" a source or "add a source" in a way that implies putting it on the ad. Say "hold" or "keep on file" instead.
- A line that attributes words to someone ("They say...", "The industry calls it...") is a factual claim that they said it: set claim_kind "factual", not "rhetoric".
- Risk type: any risk that could break a CAP rule (misleading, distress, offence, harm) is type "regulatory". Use "reputational" and "audience" only for risks no CAP rule covers (e.g. backlash, alienating supporters).
- One risk per issue. Never combine an evidence problem (fixable_by_evidence = true) with a wording or caveat problem (false) in one risk; split them. Example: "90% stat needs a source" (true) vs "90% may only apply to England; the ad says UK" (false: reword or add a caveat on the ad). Only raise the wording or caveat risk if there is a real reason to suspect it, not as a generic possibility.
- Only put an item on the checklist if holding evidence or sign-off would fix it. A claim that needs rewording goes in fixes only, never on the checklist.
- Media-owner acceptance (TfL, Global and similar) is a checklist item, not a risk.
- Each checklist item's evidence_needed must be specific: what the source must show to match how the ad will be read (scope, date, region, exact wording). Example: "a UK-wide, post-2020 source showing 90% of pigs...; if it says 'up to' or 'England', reword the claim".
- In free text, name rulings (e.g. "the ASA ruling on Viva!"). Never mention the "reference pack", file names, or tool internals.

Plain English rules:
- Write for a campaigner, not a lawyer. Short sentences, no jargon.
- Name things specifically: quote the ad's exact words, and name the body or source (e.g. "the Animal Welfare Committee, which advises the government") rather than "the committee" or "the claim".
- No generic hedging (e.g. "may be selective, out of context or outdated"). State the specific concern and why, or leave it out.
- Say what to do, not just the rule. Example: "Check the quote matches the report word for word, and avoid wording that suggests the committee supports your campaign."
- Never put rule numbers in sentences. Put them in the "rules" array on risks, claims and checklist items, in the form ["CAP 3.47", "CAP 3.52"] (empty array if none).

CAP Section 3 focus. For campaign ads, apply only these rules and ignore the rest of Section 3 (prices, availability, competitor comparisons, reviews, guarantees):
- Judge the overall impression and likely effect on viewers, not intent.
- 3.1: the ad must not materially mislead.
- 3.2: obvious rhetoric or exaggeration people won't take literally is allowed. Don't demand evidence for it (claim_kind "rhetoric").
- 3.6: opinions ("cruel", "wrong") are fine if clearly opinion (claim_kind "opinion"). Flag only an opinion presented as fact.
- 3.7: factual claims (claim_kind "factual") need evidence HELD before launch, not shown on the ad. Only factual claims get missing-evidence risks or checklist items.
- 3.3: for space-limited formats such as posters, supporting detail on the linked website counts in the advertiser's favour.
- 3.9/3.10: if a claim is only accurate with a caveat (scope, region, date, "up to"), the caveat must be on the ad, clearly. A website can't fix a headline that is misleading without its caveat. This is a fix, not a checklist item.
- 3.13: don't present contested science as settled; suggest attributing it ("X found...") instead.
- 3.5: the ad must make clear who is behind it (name, logo or URL).
- 3.47/3.50: quotes need proof they are genuine and accurate; quotes from published sources don't need permission.
- 3.52: quoting a public body must not imply it endorses the campaign.
- 3.51: never suggest saying the ad is ASA/CAP approved.
- 3.23-3.26: apply only if the ad offers something "free".
- Checklist "where": use "keep on file + publish on website (recommended)" for headline stats and quotes likely to be challenged publicly; "get sign-off" for approvals; otherwise "keep on file". Do not add a Copy Advice item; the system adds it.

Length limits (strict):
- summary: max 2 sentences.
- claims[].notes: max 20 words.
- attacks[].quote: one line, max 25 words.
- fixes[].fix and fixes[].sharpest_defensible_version: max 30 words each; do not restate the claim.
- working: max 5 items, one line each.
- No preamble, reasoning or any text outside the JSON object.
`;

const CAP_RULE = /B?CAP/i;

/** A risk that cites a CAP/BCAP rule is a regulatory risk, whatever type the model gave it. */
function normaliseRiskTypes(report: Report): Report {
  return {
    ...report,
    risks: report.risks.map((r) =>
      r.rules.some((x) => CAP_RULE.test(x)) ? { ...r, type: "regulatory" as const } : r,
    ),
  };
}

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
  for (const c of report.claims) {
    if (c.source_ref && !(c.source_ref.replaceAll("\\", "/") in docs))
      problems.add(`source_ref '${c.source_ref}' does not match any file in reference/ (use the relative path, e.g. rulings/peta-2023-08.md)`);
  }
  const corpus = Object.values(docs).join("\n").toLowerCase();
  const texts = [
    report.summary,
    ...report.claims.map((c) => c.notes),
    ...report.legal_flags,
    ...report.fixes.map((f) => f.fix),
    ...report.risks.map((r) => r.issue),
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
      parsed.data = normaliseRiskTypes(parsed.data);
      const verdict = computeVerdict(parsed.data.risks);
      const checklist = parsed.data.checklist.some((c) => /copy advice/i.test(c.item))
        ? parsed.data.checklist
        : [...parsed.data.checklist, { ...COPY_ADVICE_ITEM }];
      const report: Report = {
        ...parsed.data,
        checklist,
        verdict,
        model_verdict: parsed.data.verdict !== verdict ? parsed.data.verdict : undefined,
        verdict_after_checklist: computeVerdictAfterChecklist(parsed.data.risks),
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
