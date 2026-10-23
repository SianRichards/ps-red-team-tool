# ps-red-team-tool

Reviews draft animal welfare campaign materials (ads, posters, scripts, social posts) before launch. It finds the weak points critics could use against you and suggests fixes that keep the impact. First built for Project Slingshot (UK).

<!-- TODO: add a screenshot of a report, e.g. docs/screenshot.png -->
![Screenshot of a review report (placeholder)](docs/screenshot.png)

## About this tool

**What's red teaming?**
Getting someone to attack your work on purpose, before your opponents do. It comes from military and security testing: one team plays the enemy to find weak spots.

**What does this tool do?**
It reads a draft ad, poster, script or post the way critics will. It flags weak points and suggests fixes that keep the message sharp.

**What can it help prevent?**
- An ad banned after an ASA complaint, which hands industry a PR win
- Legal threats over claims you can't fully back up
- Ads pulled by TfL or other poster sites
- Press stories about exaggerated stats or unclear sources
- Messages that put off the people you're trying to reach

**What it isn't**
Not a lawyer, and not the final say. It flags risks; your team decides.

## Reading a report

- **As it stands**: the verdict for the draft as submitted, with the main reasons.
- **To lower the risk, make sure you have**: a checklist of evidence and sign-offs to hold *before launch*. You don't need these on the ad. Keep them on file and be ready to send them to the ASA if asked.
- **Once done**: the verdict if every item on the checklist is sorted. Risks that need rewording (not evidence) stay, so this can still be high.
- Below that: risks, claims, likely attacks, fixes, what's working, and legal flags.

## Setup

1. **Install Node.js** (version 20 or newer) from [nodejs.org](https://nodejs.org).
2. **Clone the repo**:
   ```
   git clone https://github.com/SianRichards/ps-red-team-tool.git
   cd ps-red-team-tool
   ```
3. **Install dependencies**: `npm install`
4. **Add your API key.** Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY` to your key from [openrouter.ai/keys](https://openrouter.ai/keys). The key stays on your machine and is only used by the local server.
5. **Start it**: `npm run dev`, then open [http://localhost:5173](http://localhost:5173).

Optional settings in `.env`: `MODEL_DEFAULT` and `MODEL_DEEP` (OpenRouter model IDs), `MODEL_JUDGE` (used by evals), `PORT` (default 3001).

## Adding rulings and evidence

Everything in `reference/` (including subfolders) is read on every review: `.md`, `.txt` and `.pdf` files. The model is told to cite only what is in there, and citations that don't match a file are flagged in the report. Keep files focused. The whole folder is sent with every review, so very large files cost more and slow things down.

**ASA rulings** go in `reference/rulings/`, one markdown file per ruling, named like `peta-2023-08.md`. Use this card format:

```
# ASA ruling: [Advertiser], [Month Year]
Outcome: Upheld / Not upheld / Upheld in part
Medium: poster / social / TV / leaflet
Claim type: statistic / "humane" / imagery / health / environmental
CAP clauses: 3.1, 3.7 ...
What the ad said: [1-2 lines]
Why: [1-2 lines on the ASA's reasoning]
Link: [ruling URL]
```

Copy the clause numbers and the link from the ASA ruling page. Don't paraphrase a ruling from memory.

**Evidence files** (research, statistics, policy documents such as TfL advertising policy) go in `reference/` as `.md`, `.txt` or `.pdf`. Put the source, date and region at the top of each file, because the tool checks whether a source matches how the ad will be read.

## Running evals

Evals check the tool against ads with known outcomes. Each case is a folder in `evals/cases/<name>/`:

- `submission.txt` (or an image/PDF named `submission.*`): the ad, as the ad itself. No outcome or reasoning.
- `expected.json`: `must_flag` (issues the review must raise), `expected_verdict`, and optionally `expected_verdict_after_checklist`, `campaign`, `placement`, `audience`.
- `ruling.md`: the source ruling, for reference only. It is never sent to the model.

Don't also put a case's ruling card in `reference/`, or the test is open-book.

```
npm run evals                                            # all cases, 3 runs each
npm run evals -- --runs 2 --effort medium                # fewer runs, set effort (low|medium|high|all)
npm run evals -- --case viva-2018-milk-cancer            # one case
npm run evals -- --model deep                            # use the deep model
```

The runner prints, per case, whether the verdict matched and how often each `must_flag` issue was caught (judged by a second model). Results are saved to `evals/results/` (not committed). Runs where the judge fails are shown as `judge_error` and left out of the issue scores. Evals call the API, so they cost money: roughly 3-10 US cents per run.

## Privacy

- **Drafts leave your machine.** Each review sends the submission text and any images or PDFs to [OpenRouter](https://openrouter.ai), which passes them to Anthropic to generate the report. Don't submit anything you aren't comfortable sending to those services.
- In your OpenRouter account settings, turn off prompt/response logging and training on your data, and check the privacy settings before using unreleased material.
- **Reports are saved locally** in `reviews/` as JSON, including the campaign details you entered. They are git-ignored and must never be committed. Delete them when you no longer need them.
- The API key lives only in `.env`, which is also git-ignored.

## Not legal advice

This tool supports your campaign team. It can be wrong, it only knows what is in `reference/`, and it is not a substitute for a lawyer or for the ASA/CAP's own advice. Get legal review for anything it flags as high risk. If you use CAP's free Copy Advice service, don't describe the ad as ASA/CAP approved afterwards.

## Development

- Frontend: Vite + React + Tailwind. Backend: one Express server (`server/index.ts`). Report schema: `shared/schema.ts` (zod), shared by both.
- `npm run dev` runs both; Vite proxies `/api` to Express on :3001. `npm run typecheck` checks types.
- The main system prompt is `prompts/red-team-context.md`; output rules live in `server/reviewer.ts`.

## Licence

[MIT](LICENSE)
