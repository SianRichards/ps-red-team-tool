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
    res.json(await runReview(body));
  } catch (e: any) {
    console.error(e);
    res.status(e instanceof ReviewError ? 400 : 500).json({ error: e?.message ?? "Review failed" });
  }
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`API on http://localhost:${port}`));
