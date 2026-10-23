import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { TAB_KEYS, joinAnd, pathToVerdict, resolvedIssueIds, tabRating, type Issue, type Report, type ReviewResult, type TabKey, type Todo } from "../shared/schema";

const RATING_ORDER = { High: 0, Medium: 1, Low: 2 } as const;
const BADGE = {
  High: "bg-fg text-page",
  Medium: "bg-orange text-black",
  Low: "border border-fg text-fg",
} as const;

const TABS: Record<TabKey, { label: string; who: string; note?: string }> = {
  regulators: { label: "Regulators", who: "ASA, CAP and media owners" },
  public: {
    label: "Public & press",
    who: "The public, supporters and the press",
    note: "Likely reactions, based on the ad's content. Not tested against real responses.",
  },
  industry: {
    label: "Industry & critics",
    who: "Industry, trade bodies and critics",
    note: "Likely reactions, based on the ad's content. Not tested against real responses.",
  },
};

const TODO_GROUPS: { type: Todo["type"]; heading: string }[] = [
  { type: "hold evidence", heading: "Hold evidence" },
  { type: "reword", heading: "Reword" },
  { type: "get approval", heading: "Get approval" },
  { type: "prepare response", heading: "Prepare a response" },
];

function Badge({ level }: { level: keyof typeof BADGE | null }) {
  if (!level) return <span className="inline-block border border-fg/60 px-3 py-0.5 text-sm opacity-70">No issues</span>;
  return (
    <span className={`inline-block rounded-full px-3 py-0.5 text-sm font-semibold ${BADGE[level]}`}>{level}</span>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="ml-1 inline-block whitespace-nowrap border border-fg px-2 py-0.5 text-xs">{children}</span>;
}

function RuleTags({ rules }: { rules: string[] }) {
  if (!rules.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {rules.map((r) => (
        <span key={r} className="whitespace-nowrap bg-fg/10 px-1.5 py-0.5 text-xs text-fg/60">
          {r}
        </span>
      ))}
    </span>
  );
}

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="panel border border-fg">
      <summary className="select-none px-5 py-3 text-sm font-semibold">
        <span aria-hidden className="mr-2 inline-block h-2 w-2 bg-red align-middle" />
        {title}
      </summary>
      <div className="overflow-x-auto px-5 pb-5 pt-2">{children}</div>
    </details>
  );
}

function Table({ head, rows }: { head: string[]; rows: { cells: ReactNode[] }[] }) {
  if (!rows.length) return <p className="opacity-70">None.</p>;
  return (
    <table className="w-full text-left text-[15px]">
      <thead>
        <tr className="border-b border-fg">
          {head.map((h) => (
            <th key={h} className="px-3 py-2 text-sm font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-fg/60 align-top">
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

function Label({ children }: { children: ReactNode }) {
  return <span className="block text-sm text-accent-text">{children}</span>;
}

function verdictClass(v: Report["verdict"]) {
  if (v === "Needs changes" || v === "Ready with minor fixes") return "text-accent-text";
  return "text-fg";
}

function sortIssues(issues: Issue[], covered: Set<string>) {
  // Highest rating first; within a rating, issues covered by a to-do come last.
  return [...issues].sort(
    (a, b) => RATING_ORDER[a.rating] - RATING_ORDER[b.rating] || Number(covered.has(a.id)) - Number(covered.has(b.id)),
  );
}

function IssueCard({ issue, covered }: { issue: Issue; covered: boolean }) {
  return (
    <div className={`flex flex-col gap-2 border border-fg p-4 text-[15px] ${covered ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">{issue.title}</p>
        <Badge level={issue.rating} />
      </div>
      {issue.ad_quote && (
        <blockquote className="border-l-2 border-accent-text pl-3 italic">“{issue.ad_quote}”</blockquote>
      )}
      <p className="opacity-90">{issue.detail}</p>
      {(issue.rules.length > 0 || covered) && (
        <p>
          <RuleTags rules={issue.rules} />
          {covered && <Tag>Covered by a to-do</Tag>}
        </p>
      )}
    </div>
  );
}

function TodoCard({ todo, titles }: { todo: Todo; titles: Map<string, string> }) {
  const about = todo.issue_ids.map((id) => titles.get(id)).filter(Boolean) as string[];
  return (
    <li className="border border-fg p-4 text-[15px]">
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" />
        <span className="block space-y-1.5">
          <span className="block font-medium">
            {todo.action}
            {todo.where && <Tag>{todo.where}</Tag>}
          </span>
          {about.length > 0 && <span className="block text-sm opacity-70">About: {about.join("; ")}</span>}
          {todo.detail && <span className="block opacity-90">{todo.detail}</span>}
          {todo.suggested_wording && (
            <span className="block">
              <Label>Suggested wording</Label>
              {todo.suggested_wording}
            </span>
          )}
          {todo.likely_attack && (
            <span className="block">
              <Label>Likely attack</Label>
              {todo.likely_attack}
            </span>
          )}
          {todo.suggested_reply && (
            <span className="block">
              <Label>Suggested reply</Label>
              {todo.suggested_reply}
            </span>
          )}
          {todo.rules.length > 0 && (
            <span className="block">
              <RuleTags rules={todo.rules} />
            </span>
          )}
        </span>
      </label>
    </li>
  );
}

function TabPanel({ tabKey, report }: { tabKey: TabKey; report: Report }) {
  const tab = report.tabs[tabKey];
  const covered = resolvedIssueIds(report.tabs);
  const issues = sortIssues(tab.issues, covered);
  const titles = new Map(Object.values(report.tabs).flatMap((t) => t.issues.map((i) => [i.id, i.title] as const)));
  const { note } = TABS[tabKey];
  return (
    <div className="space-y-8">
      {note && <p className="text-sm opacity-70">{note}</p>}

      <section>
        <h3 className="mb-2 font-semibold">Overall assessment</h3>
        <p className="max-w-2xl text-[15px]">{tab.assessment}</p>
      </section>

      <section>
        <h3 className="mb-3 font-semibold">Problems</h3>
        {issues.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {issues.map((i) => (
              <IssueCard key={i.id} issue={i} covered={covered.has(i.id)} />
            ))}
          </div>
        ) : (
          <p className="opacity-70">No problems found for this audience.</p>
        )}
      </section>

      <section>
        <h3 className="mb-3 font-semibold">What to do</h3>
        {tab.todo.length ? (
          <div className="space-y-6">
            {TODO_GROUPS.map(({ type, heading }) => {
              const items = tab.todo.filter((d) => d.type === type);
              if (!items.length) return null;
              return (
                <div key={type}>
                  <h4 className="mb-1 text-sm font-semibold text-accent-text">{heading}</h4>
                  {type === "hold evidence" && (
                    <p className="mb-3 max-w-2xl text-[15px] opacity-90">
                      You don't need these on the ad. Keep them on file before launch and be ready to send them to the
                      ASA if asked. For posters, putting supporting detail on your website counts in your favour, but
                      it can't fix a headline that's misleading without a caveat.
                    </p>
                  )}
                  <ul className="space-y-4">
                    {items.map((d, i) => (
                      <TodoCard key={i} todo={d} titles={titles} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="opacity-70">Nothing to do for this audience.</p>
        )}
      </section>

      {tabKey === "regulators" && (
        <div className="space-y-4">
          <Section title="Claims checked">
            <Table
              head={["Claim", "Kind", "Evidence", "Notes", "Source"]}
              rows={report.tabs.regulators.claims.map((c) => ({
                cells: [
                  c.claim,
                  <Tag key="k">{c.claim_kind}</Tag>,
                  c.evidence_status,
                  <>
                    {c.notes} <RuleTags rules={c.rules} />
                  </>,
                  c.source_ref ?? "-",
                ],
              }))}
            />
          </Section>
          {report.tabs.regulators.legal_flags.length > 0 && (
            <Section title="Other legal checks" open>
              <List items={report.tabs.regulators.legal_flags} />
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReportView({ result }: { result: ReviewResult }) {
  const { report } = result;
  const [active, setActive] = useState<TabKey>("regulators");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (!report?.tabs) {
    return (
      <p className="border border-fg p-4 text-[15px]">
        This review is in an older format and can't be shown. Re-run the review.
      </p>
    );
  }

  function onKeyDown(e: KeyboardEvent, i: number) {
    const last = TAB_KEYS.length - 1;
    const next =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(TAB_KEYS[next]);
    tabRefs.current[TAB_KEYS[next]]?.focus();
  }

  const summaryRows = TAB_KEYS.map((k) => {
    const issues = sortIssues(report.tabs[k].issues, resolvedIssueIds(report.tabs));
    return { key: k, rating: tabRating(report.tabs[k].issues), top: issues[0]?.title ?? null, count: issues.length };
  });

  const headline = report.verdict_after_todos ?? report.verdict;
  const { rewords, sources, approvers } = pathToVerdict(report);
  const steps = [
    rewords > 0 && `reword ${rewords} ${rewords === 1 ? "line" : "lines"}`,
    sources > 0 && `hold ${sources} ${sources === 1 ? "source" : "sources"}`,
    approvers.length > 0 && `get approval from ${joinAnd(approvers)}`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-8">
      <div className="border-t border-fg pt-6">
        <p className="mb-2 max-w-2xl text-[15px]">
          <span className="font-semibold">Bottom line: </span>
          {report.bottom_line}
        </p>
        {steps.length > 0 && (
          <p className="mt-4 max-w-2xl text-[15px]">
            <span className="font-semibold">Before launch: </span>
            {steps.join(" · ")}
          </p>
        )}
        <h2 className={`big-title mt-4 text-5xl sm:text-6xl ${verdictClass(headline)}`}>
          <span className="opacity-70">Once done:</span> {headline}
        </h2>
        {report.verdict_after_todos && report.verdict_after_todos !== report.verdict && (
          <p className="mt-2 text-sm opacity-70">Right now: {report.verdict}</p>
        )}
        <ul className="mt-5 max-w-2xl divide-y divide-fg/40 border-y border-fg/40 text-[15px]">
          {summaryRows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <button className="w-40 text-left font-semibold underline-offset-4 hover:underline" onClick={() => setActive(r.key)}>
                {TABS[r.key].label}
              </button>
              <Badge level={r.rating} />
              <span className="min-w-0 flex-1 opacity-90">{r.top ?? ""}</span>
            </li>
          ))}
        </ul>
      </div>

      {report.unverified_citations.length > 0 && (
        <div className="bg-orange px-5 py-4 text-[15px] text-black">
          <p className="font-semibold">Citation check</p>
          <List items={report.unverified_citations} />
        </div>
      )}

      <div>
        <div role="tablist" aria-label="Audiences" className="flex flex-wrap border-b border-fg">
          {TAB_KEYS.map((k, i) => {
            const row = summaryRows[i];
            const selected = active === k;
            return (
              <button
                key={k}
                ref={(el) => {
                  tabRefs.current[k] = el;
                }}
                role="tab"
                id={`tab-${k}`}
                aria-selected={selected}
                aria-controls={`panel-${k}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(k)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={`flex items-center gap-2 border border-b-0 px-4 py-2 text-[15px] font-semibold ${
                  selected ? "border-fg bg-fg/10" : "border-transparent hover:border-fg/60"
                }`}
              >
                {TABS[k].label}
                <Badge level={row.rating} />
                <span className="text-sm font-normal opacity-70">{row.count}</span>
              </button>
            );
          })}
        </div>
        <div
          role="tabpanel"
          id={`panel-${active}`}
          aria-labelledby={`tab-${active}`}
          tabIndex={0}
          className="pt-6 focus-visible:outline-offset-4"
        >
          <p className="mb-6 text-sm opacity-70">{TABS[active].who}</p>
          <TabPanel tabKey={active} report={report} />
        </div>
      </div>

      <Section title="What's working" open>
        <List items={report.working} />
      </Section>

      <p className="text-xs opacity-70">
        Not legal advice. This tool supports the campaign team; get legal review for anything flagged.
      </p>
    </div>
  );
}
