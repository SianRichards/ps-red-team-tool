import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import {
  Report,
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
  "claims": [{"claim": string, "evidence_status": "Sourced"|"Weak"|"Missing", "risk": "High"|"Medium"|"Low", "notes": string, "source_ref": <exact reference doc name> or null}],
  "attacks": [{"critic": "industry"|"asa"|"media"|"public"|"ad_owner", "quote": string}],
  "risks": [{"issue": string, "rating": "High"|"Medium"|"Low", "type": "regulatory"|"reputational"|"audience"}],
  "fixes": [{"issue": string, "fix": string, "sharpest_defensible_version": string}],
  "working": [string],
  "verdict": "Ready"|"Ready with minor fixes"|"Needs changes"|"High risk, get legal review",
  "legal_flags": [string]
}
Rules: never invent rulings or sources. Only cite rulings/documents that appear in the reference docs, and set source_ref to the exact doc name (or null). If no reference doc supports a claim, say so in notes. Sort risks High first.
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
    names = (await fs.readdir(REFERENCE_DIR)).sort();
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
    if (c.source_ref && !(c.source_ref in docs))
      problems.add(`source_ref '${c.source_ref}' does not match any file in reference/`);
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

export async function runReview(req: ReviewRequest): Promise<ReviewResponse> {
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
      const report = { ...parsed.data, unverified_citations: checkCitations(parsed.data, docs) };
      const saved_as = await saveReport(report, req, model);
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

async function saveReport(report: Report, req: ReviewRequest, model: string): Promise<string> {
  await fs.mkdir(REVIEWS_DIR, { recursive: true });
  const slug =
    req.campaign.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) ||
    "review";
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const name = `${ts}_${slug}.json`;
  const payload = {
    model,
    campaign: req.campaign,
    placement: req.placement,
    audience: req.audience,
    ...report,
  };
  await fs.writeFile(path.join(REVIEWS_DIR, name), JSON.stringify(payload, null, 2), "utf8");
  return `reviews/${name}`;
}
