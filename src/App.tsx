import { useEffect, useRef, useState } from "react";
import type {
  Config,
  Effort,
  FileUpload,
  ModelChoice,
  ReviewResult,
} from "../shared/schema";
import AboutPanel from "./components/AboutPanel";
import FileDrop from "./FileDrop";
import ReportView from "./Report";

const field = "mt-1 w-full border-0 bg-transparent py-1 text-base outline-none";

function readFile(file: File): Promise<FileUpload> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () =>
      resolve({
        name: file.name,
        mime: file.type,
        data: String(r.result).split(",")[1],
      });
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [campaign, setCampaign] = useState("");
  const [placement, setPlacement] = useState("");
  const [audience, setAudience] = useState("");
  const [model, setModel] = useState<ModelChoice>("default");
  const [effort, setEffort] = useState<Effort>("medium");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutBtn = useRef<HTMLButtonElement>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const t = document.documentElement.dataset.theme;
    return t === "light" ? "light" : "dark";
  });

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  async function run() {
    setError("");
    if (!text.trim() && !files.length)
      return setError("Add some text, an image or a PDF first.");
    setLoading(true);
    try {
      const uploads = await Promise.all(files.map(readFile));
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          files: uploads,
          campaign,
          placement,
          audience,
          model,
          effort,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(body.error ?? `Request failed (${res.status})`);
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-3 sm:p-5">
      <div className="frame flex min-h-[calc(100vh-2.5rem)] flex-col px-6 py-6 sm:px-10">
        <header className="flex items-baseline justify-between border-b border-red pb-3">
          <span className="font-semibold lowercase">campaign red team</span>
          <span className="flex items-baseline gap-4">
            <span className="hidden text-sm text-muted sm:inline">
              Review draft materials before launch
            </span>
            <button
              ref={aboutBtn}
              onClick={() => setAboutOpen(true)}
              className="text-sm underline-offset-4 hover:underline"
            >
              About
            </button>
            <button
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="rounded-full border border-fg px-3 py-0.5 text-sm hover:bg-fg hover:text-page"
            >
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </span>
        </header>

        <div className="flex flex-1 flex-col gap-10 py-10 lg:flex-row">
          <aside className="w-full shrink-0 lg:w-64">
            <h2 className="big-title lowercase mb-6 text-5xl">red team</h2>
            <div className="divide-y divide-line border-y border-line [&>label]:block [&>label]:py-3">
              <label className="text-sm">
                <span className="font-semibold">Placement</span>
                <input
                  className={field}
                  placeholder="e.g. London Underground, Instagram ads, billboard, own website"
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Campaign name
                <input
                  className={field}
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Target audience
                <input
                  className={field}
                  placeholder="e.g. young adults, commuters"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Model
                <select
                  className={field}
                  value={model}
                  onChange={(e) => setModel(e.target.value as ModelChoice)}
                >
                  <option value="default">Sonnet (default)</option>
                  <option value="deep">Opus (deep review)</option>
                </select>
                {config && (
                  <span className="text-sm text-muted">
                    {config.models[model]}
                  </span>
                )}
              </label>
              <label className="text-sm">
                Effort
                <select
                  className={field}
                  value={effort}
                  onChange={(e) => setEffort(e.target.value as Effort)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>
          </aside>

          <main className="min-w-0 flex-1 space-y-6">
            <label className="block text-sm">
              Paste text, script or video transcript
              <textarea
                className={`${field} field-surface h-48 border border-line px-3`}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <FileDrop files={files} onChange={setFiles} />

            <button
              onClick={run}
              disabled={loading}
              className="rounded-full bg-red px-8 py-3 font-semibold text-on-red hover:bg-fg hover:text-page disabled:opacity-50"
            >
              {loading ? "Reviewing..." : "Run review"}
            </button>
            {error && (
              <p className="border border-fg bg-fg px-5 py-3 text-page">
                <strong>Error:</strong> {error}
              </p>
            )}

            {result && <ReportView result={result} />}
          </main>
        </div>

        <footer className="text-right text-xs text-muted"></footer>
      </div>
      <AboutPanel
        open={aboutOpen}
        onClose={() => {
          setAboutOpen(false);
          aboutBtn.current?.focus();
        }}
      />
    </div>
  );
}
