import type { ReactNode } from "react";
import type { Report, ReviewResult } from "../shared/schema";

const RATING_ORDER = { High: 0, Medium: 1, Low: 2 } as const;
const BADGE = {
  High: "bg-fg text-page",
  Medium: "bg-orange text-black",
  Low: "border border-fg text-fg",
} as const;

function Badge({ level }: { level: keyof typeof BADGE }) {
  return (
    <span className={`inline-block rounded-full px-3 py-0.5 text-sm font-semibold ${BADGE[level]}`}>{level}</span>
  );
}

function Section({
  title,
  index,
  children,
  open = false,
}: {
  title: string;
  index: number;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="panel border border-fg">
      <summary className="select-none px-5 py-3 text-sm font-semibold lowercase">
        <span aria-hidden className="mr-2 inline-block h-2 w-2 bg-red align-middle" />
        {title} {String(index).padStart(2, "0")}
      </summary>
      <div className="overflow-x-auto px-5 pb-5 pt-2">{children}</div>
    </details>
  );
}

function Table({ head, rows }: { head: string[]; rows: { cells: ReactNode[]; high?: boolean }[] }) {
  if (!rows.length) return <p className="opacity-70">None.</p>;
  return (
    <table className="w-full text-left text-[15px]">
      <thead>
        <tr className="border-b border-fg">
          {head.map((h) => (
            <th key={h} className="px-3 py-2 text-sm font-semibold lowercase">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={`border-b border-fg/60 align-top ${r.high ? "font-medium" : ""}`}>
            {r.cells.map((c, j) => (
              <td key={j} className="px-3 py-2">
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
  if (!items.length) return <p className="opacity-70">None.</p>;
  return (
    <ul className="list-disc space-y-2 pl-5 text-[15px]">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function Cards({ items }: { items: { label: string; badge?: ReactNode; body: ReactNode }[] }) {
  if (!items.length) return <p className="opacity-70">None.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((c, i) => (
        <div key={i} className="flex flex-col gap-3 border border-fg p-4 text-[15px]">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold">{c.label}</p>
            {c.badge}
          </div>
          <div className="space-y-2 opacity-90">{c.body}</div>
        </div>
      ))}
    </div>
  );
}

function verdictClass(v: NonNullable<Report["verdict"]>) {
  if (v === "High risk, get legal review") return "text-fg";
  if (v === "Needs changes" || v === "Ready with minor fixes") return "text-accent-text";
  return "text-fg";
}

export default function ReportView({ result }: { result: ReviewResult }) {
  const { report } = result;
  const risks = [...report.risks].sort((a, b) => RATING_ORDER[a.rating] - RATING_ORDER[b.rating]);
  return (
    <div className="space-y-6">
      <div className="border-t border-fg pt-6">
        <p className="mb-2 text-sm lowercase opacity-70">as it stands</p>
        <h2 className={`big-title text-6xl sm:text-7xl ${verdictClass(report.verdict)}`}>{report.verdict}</h2>
        <p className="mt-4 max-w-2xl text-[15px]">{report.summary}</p>
        {risks.length > 0 && (
          <div className="mt-4 max-w-2xl">
            <p className="mb-1 text-sm lowercase opacity-70">main reasons</p>
            <List items={risks.slice(0, 3).map((r) => r.issue)} />
          </div>
        )}
        {report.model_verdict && (
          <p className="mt-2 text-sm opacity-70">
            Verdict is computed from the risk ratings. The model's own verdict was "{report.model_verdict}".
          </p>
        )}
      </div>

      {report.checklist.length > 0 && (
        <div className="border border-fg p-5">
          <p className="mb-3 text-sm font-semibold lowercase">to lower the risk, make sure you have:</p>
          <ul className="space-y-4 text-[15px]">
            {report.checklist.map((c, i) => (
              <li key={i}>
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-medium">{c.item}</span>
                    {c.related_claim && <span className="opacity-70"> (re: {c.related_claim})</span>}
                    <span className="mt-1 block opacity-90">{c.why}</span>
                    <span className="mt-1 block">
                      <span className="text-sm lowercase text-accent-text">evidence needed: </span>
                      {c.evidence_needed}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.verdict_after_checklist && (
        <div>
          <p className="mb-2 text-sm lowercase opacity-70">once done</p>
          <h3 className={`big-title text-4xl sm:text-5xl ${verdictClass(report.verdict_after_checklist)}`}>
            {report.verdict_after_checklist}
          </h3>
        </div>
      )}
      <p className="text-sm opacity-70">
        Not legal advice. This tool supports the campaign team; get legal review for anything flagged.
      </p>

      {report.unverified_citations.length > 0 && (
        <div className="bg-orange px-5 py-4 text-[15px] text-black">
          <p className="font-semibold">Citation check</p>
          <List items={report.unverified_citations} />
        </div>
      )}

      <Section title="risks" index={1} open>
        <Cards
          items={risks.map((r) => ({
            label: r.issue,
            badge: <Badge level={r.rating} />,
            body: (
              <p className="text-sm lowercase">
                {r.type}
                {r.fixable_by_evidence && " · fixable with evidence"}
              </p>
            ),
          }))}
        />
      </Section>
      <Section title="claims" index={2} open>
        <Table
          head={["Claim", "Evidence", "Risk", "Notes", "Source"]}
          rows={report.claims.map((c) => ({
            cells: [c.claim, c.evidence_status, <Badge level={c.risk} />, c.notes, c.source_ref ?? "-"],
            high: c.risk === "High",
          }))}
        />
      </Section>
      <Section title="attacks" index={3}>
        <Table head={["Critic", "Quote"]} rows={report.attacks.map((a) => ({ cells: [a.critic, a.quote] }))} />
      </Section>
      <Section title="fixes" index={4} open>
        <Cards
          items={report.fixes.map((f) => ({
            label: f.issue,
            body: (
              <>
                <p>{f.fix}</p>
                <p>
                  <span className="text-sm lowercase text-accent-text">sharpest defensible version: </span>
                  {f.sharpest_defensible_version}
                </p>
              </>
            ),
          }))}
        />
      </Section>
      <Section title="what's working" index={5}>
        <List items={report.working} />
      </Section>
      <Section title="legal flags" index={6} open={report.legal_flags.length > 0}>
        <List items={report.legal_flags} />
      </Section>
    </div>
  );
}
