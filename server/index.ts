import "dotenv/config";
import express from "express";
import { MODELS, ReviewError, runReview } from "./reviewer.js";
import type { ReviewRequest } from "../shared/schema.js";

const app = express();
app.use(express.json({ limit: "50mb" }));

app.get("/api/config", (_req, res) => res.json({ models: MODELS }));

app.post("/api/review", async (req, res) => {
  const b = req.body ?? {};
  const body: ReviewRequest = {
    text: String(b.text ?? ""),
    files: Array.isArray(b.files) ? b.files : [],
    campaign: String(b.campaign ?? ""),
    placement: String(b.placement ?? ""),
    audience: String(b.audience ?? ""),
    model: b.model === "deep" ? "deep" : "default",
    effort: ["low", "medium", "high"].includes(b.effort) ? b.effort : "medium",
  };
  try {
    const { report, usage, model, saved_as } = await runReview(body);
    const verdicts = `${report.verdict}${report.model_verdict ? ` (model said: ${report.model_verdict})` : ""}`;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    console.log(
      `[review] ${stamp} · ${model} · effort ${body.effort} · prompt ${usage.prompt_tokens.toLocaleString("en-US")} (cached ${usage.cached_tokens.toLocaleString("en-US")}) · verdict ${verdicts} · completion ${usage.completion_tokens.toLocaleString("en-US")} · ${usage.cost == null ? "cost n/a" : `$${usage.cost.toFixed(4)}`} · saved ${saved_as}`,
    );
    res.json({ report });
  } catch (e: any) {
    console.error(e);
    res.status(e instanceof ReviewError ? 400 : 500).json({ error: e?.message ?? "Review failed" });
  }
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`API on http://localhost:${port}`));
