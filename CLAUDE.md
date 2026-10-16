# Campaign Red Team Tool

## What this is
A web app that reviews draft animal welfare campaign materials (ads, posters, scripts, social posts) before launch. It finds weaknesses critics could exploit and suggests fixes that keep the impact. First target user: Project Slingshot (UK).

## Stack
- TypeScript throughout. Frontend: Vite + React + Tailwind (no component library). Backend: one Express server (`server/index.ts`, run with `tsx`) that holds the API key.
- `npm run dev` starts both (concurrently). Vite serves on :5173 and proxies `/api` to Express on :3001.
- `openai` npm SDK pointed at OpenRouter (`baseURL: "https://openrouter.ai/api/v1"`), key from `OPENROUTER_API_KEY` in `.env` (server-side only).
- Models: `MODEL_DEFAULT` (default `anthropic/claude-sonnet-5.5`) and `MODEL_DEEP` (default `anthropic/claude-opus-5.5`) in `.env`. Check IDs on openrouter.ai/models.
- Call settings: `max_tokens: 16000`, `reasoning_effort` from the sidebar (low/medium/high), `provider: { order: ["anthropic"], allow_fallbacks: false }`, `usage: { include: true }` so the response carries cost.
- No vector DB or RAG. The whole reference pack goes in the system prompt.
- Prompt caching: system message is two content blocks, [prompt + JSON output spec] then [all reference docs], with `cache_control: { type: "ephemeral" }` on the reference block.
- Images (posters, key frames): sent as OpenAI-style `image_url` parts (base64 data URLs). PDFs are converted to text with `pdf-parse` (v2 `PDFParse` API).
- Report schema is a zod schema in `shared/schema.ts`, imported by both client and server.

## Structure
```
server/index.ts          # Express: GET /api/config, POST /api/review
server/reviewer.ts       # builds prompt, calls API, validates with zod, citation check, saves review
shared/schema.ts         # zod report schema + shared request/response types
src/                     # React UI (App.tsx = form + sidebar, Report.tsx = report view)
prompts/red-team-context.md   # main system prompt (user supplies; don't edit)
reference/               # CAP Code, ASA rulings, TfL policy, evidence pack (.md/.txt/.pdf)
reviews/                 # saved reports (JSON), one per review
evals/cases/             # known-outcome ads + expected.json
evals/run_evals.ts       # not built yet
```

## Core flow
1. User uploads or pastes a submission: text, image (poster), PDF, or video transcript plus key-frame images.
2. Optional fields: campaign name, placement (e.g. London Underground, Instagram), target audience.
3. The client POSTs JSON (files as base64) to `/api/review`; `server/reviewer.ts` sends:
   - system = prompt file + output spec, then all reference files (each wrapped in `<doc name="...">`), with `cache_control` on the reference block
   - user = submission content + metadata
4. Model returns JSON matching the zod schema. Validate it; retry once (feeding the error back) on a parse failure.
5. Server fills `unverified_citations`, saves to `reviews/{timestamp}_{slug}.json`, and returns report + usage (prompt, cached, completion tokens, cost). The UI shows usage under each report.

## Report schema (JSON)
- `summary`: str
- `claims`: list of {claim, evidence_status: Sourced|Weak|Missing, risk: High|Medium|Low, notes, source_ref (reference doc name or null)}
- `attacks`: list of {critic: industry|asa|media|public|ad_owner, quote}
- `risks`: list of {issue, rating: High|Medium|Low, type: regulatory|reputational|audience}, sorted High first
- `fixes`: list of {issue, fix, sharpest_defensible_version}
- `working`: list of str
- `verdict`: Ready | Ready with minor fixes | Needs changes | High risk, get legal review
- `legal_flags`: list of str

## Rules
- Never invent rulings or sources. Any cited ruling must exist in `reference/`; flag citations that don't match a file name.
- The UI shows a "not legal advice" note on every report.
- Keep UI plain: report sections as tables and expanders, with High risks highlighted.

## Evals
- Each case in `evals/cases/<name>/`: `submission.*` plus `expected.json` (key issues that must be flagged, expected verdict).
- `evals/run_evals.ts` (run with `tsx`) runs all cases and reports per case whether each expected issue was caught (simple LLM-as-judge or keyword match) and whether the verdict matched.
- Seed with 3–5 banned ASA ads, plus 1–2 cleared ones to catch over-flagging.

## Later (not now)
- Compare report versions for the same ad
- Team login
- Comment analyser, retailer scorecard (see project notes)