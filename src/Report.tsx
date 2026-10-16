import type { ReactNode } from "react";
import type { Report, ReviewResponse } from "../shared/schema";

const RATING_ORDER = { High: 0, Medium: 1, Low: 2 } as const;
const HIGH_ROW = "bg-red-50 font-medium";

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="rounded border border-gray-200 bg-white">
      <summary className="cursor-pointer select-none px-4 py-2 font-semibold">{title}</summary>
      <div className="overflow-x-auto px-4 pb-4">{children}</div>
    </details>
  );
}

function Table({ head, rows }: { head: string[]; rows: { cells: ReactNode[]; high?: boolean }[] }) {
  if (!rows.length) return <p className="text-sm text-gray-500">None.</p>;
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-gray-300">
          {head.map((h) => (
            <th key={h} className="px-2 py-1 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={`border-b border-gray-100 align-top ${r.high ? HIGH_ROW : ""}`}>
            {r.cells.map((c, j) => (
              <td key={j} className="px-2 py-1">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function List({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-gray-500">None.</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function verdictClass(v: Report["verdict"]) {
  if (v === "High risk, get legal review") return "bg-red-100 text-red-900 border-red-300";
  if (v === "Needs changes") return "bg-amber-100 text-amber-900 border-amber-300";
  return "bg-green-100 text-green-900 border-green-300";
}

export default function ReportView({ result }: { result: ReviewResponse }) {
  const { report, usage } = result;
  const risks = [...report.risks].sort((a, b) => RATING_ORDER[a.rating] - RATING_ORDER[b.rating]);
  return (
    <div className="space-y-3">
      <p className="rounded border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
        Not legal advice. This tool supports the campaign team; get legal review for anything flagged.
      </p>
      <div className={`rounded border px-4 py-2 font-semibold ${verdictClass(report.verdict)}`}>
        Verdict: {report.verdict}
      </div>
      <p>{report.summary}</p>

      {report.unverified_citations.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <p className="font-semibold">Citation check</p>
          <List items={report.unverified_citations} />
        </div>
      )}

      <Section title="Risks" open>
        <Table
          head={["Issue", "Rating", "Type"]}
          rows={risks.map((r) => ({ cells: [r.issue, r.rating, r.type], high: r.rating === "High" }))}
        />
      </Section>
      <Section title="Claims and evidence" open>
        <Table
          head={["Claim", "Evidence", "Risk", "Notes", "Source"]}
          rows={report.claims.map((c) => ({
            cells: [c.claim, c.evidence_status, c.risk, c.notes, c.source_ref ?? "-"],
            high: c.risk === "High",
          }))}
        />
      </Section>
      <Section title="Attacks critics could make">
        <Table head={["Critic", "Quote"]} rows={report.attacks.map((a) => ({ cells: [a.critic, a.quote] }))} />
      </Section>
      <Section title="Fixes" open>
        <Table
          head={["Issue", "Fix", "Sharpest defensible version"]}
          rows={report.fixes.map((f) => ({ cells: [f.issue, f.fix, f.sharpest_defensible_version] }))}
        />
      </Section>
      <Section title="What's working">
        <List items={report.working} />
      </Section>
      <Section title="Legal flags" open={report.legal_flags.length > 0}>
        <List items={report.legal_flags} />
      </Section>

      <p className="text-xs text-gray-500">
        {result.model} · prompt {usage.prompt_tokens.toLocaleString()} tokens (cached{" "}
        {usage.cached_tokens.toLocaleString()}) · completion {usage.completion_tokens.toLocaleString()} · cost{" "}
        {usage.cost == null ? "n/a" : `$${usage.cost.toFixed(4)}`} · saved to {result.saved_as}
      </p>
    </div>
  );
}
