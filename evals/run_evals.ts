import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { ReviewError, runReview } from "../server/reviewer.js";
import type { Effort, FileUpload, Report, ReviewRequest, Usage } from "../shared/schema.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CASES_DIR = path.join(ROOT, "evals", "cases");
const RESULTS_DIR = path.join(ROOT, "evals", "results");
const JUDGE_MODEL = process.env.MODEL_JUDGE || "anthropic/claude-haiku-5.5";
const EFFORTS: Effort[] = ["low", "medium", "high"];
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

interface Expected {
  must_flag: string[];
  expected_verdict: string;
  expected_verdict_after_todos?: string;
  campaign?: string;
  placement?: string;
  audience?: string;
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(`--${k}`);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const runs = Number(get("runs") ?? 3);
  const effort = get("effort") ?? "medium";
  if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a positive integer");
  if (effort !== "all" && !EFFORTS.includes(effort as Effort))
    throw new Error("--effort must be low|medium|high|all");
  return {
    runs,
    efforts: effort === "all" ? EFFORTS : [effort as Effort],
    only: get("case"),
    model: get("model") === "deep" ? ("deep" as const) : ("default" as const),
  };
}

async function loadCase(name: string): Promise<{ req: Omit<ReviewRequest, "effort">; exp: Expected }> {
  const dir = path.join(CASES_DIR, name);
  const exp: Expected = JSON.parse(await fs.readFile(path.join(dir, "expected.json"), "utf8"));
  let text = "";
  const files: FileUpload[] = [];
  for (const f of (await fs.readdir(dir)).sort()) {
    if (!f.startsWith("submission.")) continue;
    const ext = path.extname(f).toLowerCase();
    if (ext === ".txt" || ext === ".md") text += (await fs.readFile(path.join(dir, f), "utf8")) + "\n";
    else if (MIME[ext])
      files.push({ name: f, mime: MIME[ext], data: (await fs.readFile(path.join(dir, f))).toString("base64") });
  }
  if (!text.trim() && !files.length) throw new Error(`Case ${name} has no submission.* file`);
  return {
    exp,
    req: {
      text,
      files,
      campaign: exp.campaign ?? name,
      placement: exp.placement ?? "",
      audience: exp.audience ?? "",
      model: "default",
    },
  };
}

function reportText(r: Report): string {
  const lines = [`Bottom line: ${r.bottom_line}`];
  for (const [name, tab] of Object.entries(r.tabs)) {
    lines.push(`[${name}] ${tab.assessment}`);
    for (const i of tab.items) {
      const extra = [i.suggested_wording, i.likely_attack, i.suggested_reply, i.why].filter(Boolean).join(" | ");
      lines.push(
        `Item (${i.rating}, ${i.type}, ${name}): ${i.action}. ${i.detail}${i.ad_quote ? ` Ad words: "${i.ad_quote}"` : ""}${extra ? ` ${extra}` : ""}`,
      );
    }
  }
  for (const l of r.tabs.regulators.legal_flags) lines.push(`Legal flag: ${l}`);
  return lines.join("\n");
}

async function judge(ai: OpenAI, report: Report, items: string[]): Promise<{ caught: boolean[]; cost: number }> {
  const prompt = `You are grading an ad review. For each expected issue, decide whether the review clearly flags it (same substance, wording may differ).

<review>
${reportText(report)}
</review>

Expected issues:
${items.map((x, i) => `${i + 1}. ${x}`).join("\n")}

Reply with only JSON: {"caught": [true|false, ...]} with exactly ${items.length} booleans, in order.`;
  let cost = 0;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await ai.chat.completions.create({
        model: JUDGE_MODEL,
        max_tokens: 4000, // headroom: the judge model spends hidden reasoning tokens before answering
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
        usage: { include: true },
      } as any);
      cost += (resp.usage as any)?.cost ?? 0;
      const raw = resp.choices[0]?.message?.content ?? "";
      const m = raw.match(/\{[\s\S]*\}/);
      const arr = m ? JSON.parse(m[0]).caught : null;
      if (!Array.isArray(arr) || arr.length !== items.length || arr.some((x: unknown) => typeof x !== "boolean"))
        throw new Error(`unexpected judge output (finish_reason ${resp.choices[0]?.finish_reason}): ${raw.slice(0, 200)}`);
      return { caught: arr, cost };
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new JudgeError(lastErr);
}

class JudgeError extends Error {}

const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

async function main() {
  const { runs, efforts, only, model } = parseArgs();
  if (!process.env.OPENROUTER_API_KEY) throw new ReviewError("OPENROUTER_API_KEY not set. Add it to .env.");
  const ai = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY });
  const names = (await fs.readdir(CASES_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && (!only || d.name === only))
    .map((d) => d.name)
    .sort();
  if (!names.length) throw new Error("No eval cases found in evals/cases/");

  const results: any[] = [];
  const table: Record<string, string | number>[] = [];

  for (const name of names) {
    const { req, exp } = await loadCase(name);
    for (const effort of efforts) {
      console.log(`\n${name} @ ${effort}: ${runs} runs`);
      const caught = exp.must_flag.map(() => 0);
      const runRows: any[] = [];
      let verdictOk = 0;
      let afterOk = 0;
      let ok = 0;
      let judged = 0;
      let judgeErrors = 0;
      for (let i = 0; i < runs; i++) {
        let res;
        try {
          res = await runReview({ ...req, model, effort }, { save: false });
        } catch (e) {
          console.log(`  run ${i + 1} failed: ${(e as Error).message}`);
          runRows.push({ error: (e as Error).message });
          continue;
        }
        ok++;
        if (res.report.verdict === exp.expected_verdict) verdictOk++;
        if (res.report.verdict_after_todos === exp.expected_verdict_after_todos) afterOk++;
        const u: Usage = res.usage;
        const row: any = {
          verdict: res.report.verdict,
          headline: res.report.headline ?? null,
          verdict_after_todos: res.report.verdict_after_todos ?? null,
          model_verdict: res.report.model_verdict ?? null,
          usage: u,
          report: res.report,
        };
        let line = `  run ${i + 1}: ${res.report.headline} | ${res.report.verdict} -> ${res.report.verdict_after_todos} | `;
        try {
          const j = await judge(ai, res.report, exp.must_flag);
          j.caught.forEach((c, k) => c && caught[k]++);
          judged++;
          row.caught = j.caught;
          row.judge_cost = j.cost;
          line += `caught ${j.caught.filter(Boolean).length}/${j.caught.length}`;
        } catch (e) {
          judgeErrors++;
          row.judge_error = (e as Error).message;
          line += "judge_error";
        }
        runRows.push(row);
        console.log(`${line} | ${u.completion_tokens} out tokens | $${(u.cost ?? 0).toFixed(4)}`);
      }
      const good = runRows.filter((r) => !r.error);
      const summary = {
        case: name,
        effort,
        runs_ok: ok,
        runs_judged: judged,
        judge_errors: judgeErrors,
        runs,
        expected_verdict: exp.expected_verdict,
        verdict_match_rate: ok ? verdictOk / ok : null,
        expected_verdict_after_todos: exp.expected_verdict_after_todos ?? null,
        verdict_after_todos_match_rate:
          ok && exp.expected_verdict_after_todos ? afterOk / ok : null,
        must_flag: exp.must_flag.map((item, k) => ({ item, catch_rate: judged ? caught[k] / judged : null })),
        avg_completion_tokens: avg(good.map((r) => r.usage.completion_tokens)),
        avg_cost: avg(good.map((r) => r.usage.cost ?? 0)),
        headlines: Object.fromEntries(
          [...new Set(good.map((r) => r.headline))].map((h) => [h, good.filter((r) => r.headline === h).length]),
        ),
        runs_detail: runRows,
      };
      results.push(summary);
      table.push({
        case: name,
        effort,
        "ok/runs": `${ok}/${runs}`,
        "judge_error": judgeErrors,
        headline: Object.entries(summary.headlines).map(([h, n]) => `${h} x${n}`).join(", ") || "-",
        verdict: ok ? pct(verdictOk, ok) : "-",
        "after to-dos": ok && exp.expected_verdict_after_todos ? pct(afterOk, ok) : "-",
        "issues caught": judged ? pct(caught.reduce((a, b) => a + b, 0), judged * exp.must_flag.length) : "-",
        "avg out tok": Math.round(summary.avg_completion_tokens),
        "avg cost": `$${summary.avg_cost.toFixed(4)}`,
      });
      exp.must_flag.forEach((item, k) =>
        console.log(`    ${judged ? pct(caught[k], judged).padStart(4) : "   -"}  ${item}`),
      );
    }
  }

  console.log("\nSummary");
  console.table(table);
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const out = path.join(RESULTS_DIR, `${ts}.json`);
  await fs.writeFile(
    out,
    JSON.stringify({ timestamp: ts, runs, efforts, judge_model: JUDGE_MODEL, results }, null, 2),
    "utf8",
  );
  console.log(`Saved ${path.relative(ROOT, out)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
