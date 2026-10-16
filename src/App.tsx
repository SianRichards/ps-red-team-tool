import { useEffect, useState } from "react";
import type { Config, Effort, FileUpload, ModelChoice, ReviewResponse } from "../shared/schema";
import ReportView from "./Report";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm";

function readFile(file: File): Promise<FileUpload> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, mime: file.type, data: String(r.result).split(",")[1] });
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
  const [result, setResult] = useState<ReviewResponse | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  async function run() {
    setError("");
    if (!text.trim() && !files.length) return setError("Add some text, an image or a PDF first.");
    setLoading(true);
    try {
      const uploads = await Promise.all(files.map(readFile));
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, files: uploads, campaign, placement, audience, model, effort }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900">
      <aside className="w-64 shrink-0 space-y-3 border-r border-gray-200 bg-white p-4">
        <h2 className="font-semibold">Settings</h2>
        <label className="block text-sm">
          Campaign name
          <input className={field} value={campaign} onChange={(e) => setCampaign(e.target.value)} />
        </label>
        <label className="block text-sm">
          Placement
          <input
            className={field}
            placeholder="e.g. London Underground, Instagram"
            value={placement}
            onChange={(e) => setPlacement(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Target audience
          <input className={field} value={audience} onChange={(e) => setAudience(e.target.value)} />
        </label>
        <label className="block text-sm">
          Model
          <select className={field} value={model} onChange={(e) => setModel(e.target.value as ModelChoice)}>
            <option value="default">Sonnet (default)</option>
            <option value="deep">Opus (deep review)</option>
          </select>
          {config && <span className="text-xs text-gray-500">{config.models[model]}</span>}
        </label>
        <label className="block text-sm">
          Effort
          <select className={field} value={effort} onChange={(e) => setEffort(e.target.value as Effort)}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
      </aside>

      <main className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <header>
          <h1 className="text-2xl font-bold">Campaign Red Team</h1>
          <p className="text-sm text-gray-600">Review draft campaign materials before launch.</p>
        </header>

        <label className="block text-sm font-medium">
          Paste text, script or video transcript
          <textarea
            className={`${field} mt-1 h-48`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Or upload poster / key frames (images) or a PDF
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="mt-1 block text-sm"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>

        <button
          onClick={run}
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Reviewing..." : "Run review"}
        </button>
        {error && <p className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</p>}

        {result && <ReportView result={result} />}
      </main>
    </div>
  );
}
