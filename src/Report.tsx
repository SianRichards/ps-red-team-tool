import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  TAB_KEYS,
  joinAnd,
  pathToVerdict,
  ratedItems,
  sortItems,
  tabRating,
  type Item,
  type Report,
  type ReviewResult,
  type TabKey,
} from "../shared/schema";

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

const GROUPS: { type: Item["type"]; heading: string }[] = [
  { type: "rethink", heading: "Rethink" },
  { type: "reword", heading: "Reword" },
  { type: "hold evidence", heading: "Hold evidence" },
  { type: "get approval", heading: "Get approval" },
  { type: "prepare response", heading: "Prepare a response" },
];

/** Link to the ASA page for the section a rule like "CAP 3.7" or "BCAP 4.1" belongs to. */
function ruleUrl(rule: string): string | null {
  const m = rule.match(/^\s*(B?CAP)\s*(\d+)/i);
  if (!m) return null;
  const code = m[1].toUpperCase() === "BCAP" ? "broadcast" : "non_broadcast";
  return `https://www.asa.org.uk/type/${code}/code_section/${m[2].padStart(2, "0")}.html`;
}

function Badge({ level }: { level: keyof typeof BADGE | null }) {
  if (!level) return <span className="inline-block border border-fg/60 px-3 py-0.5 text-sm opacity-70">No items</span>;
  return (
    <span className={`inline-block shrink-0 rounded-full px-3 py-0.5 text-sm font-semibold ${BADGE[level]}`}>{level}</span>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="ml-1 inline-block whitespace-nowrap border border-fg px-2 py-0.5 text-xs">{children}</span>;
}

function RuleTags({ rules }: { rules: string[] }) {
  if (!rules.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {rules.map((r) => {
        const url = ruleUrl(r);
        const cls = "whitespace-nowrap bg-fg/10 px-1.5 py-0.5 text-xs text-fg/60";
        return url ? (
          <a
            key={r}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the rules on the ASA site"
            className={`${cls} underline-offset-2 hover:text-fg hover:underline`}
          >
            {r}
          </a>
        ) : (
          <span key={r} className={cls}>
            {r}
          </span>
        );
      })}
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

function verdictClass(v: NonNullable<Report["headline"]>) {
  if (v === "Needs changes" || v === "Nearly ready") return "text-accent-text";
  return "text-fg";
}

function ItemCard({ item }: { item: Item }) {
  return (
    <li className="border border-fg p-4 text-[15px]">
      <div className="flex items-start justify-between gap-3">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" />
          <span className="font-medium">{item.action}</span>
        </label>
        <Badge level={item.rating} />
      </div>
      <div className="mt-2 space-y-1.5 pl-7">
        {item.where && (
          <p>
            <Tag>{item.where}</Tag>
          </p>
        )}
        {item.ad_quote && (
          <blockquote className="border-l-2 border-accent-text pl-3 italic">“{item.ad_quote}”</blockquote>
        )}
        {item.detail && <p className="opacity-90">{item.detail}</p>}
        {item.suggested_wording && (
          <p>
            <Label>Suggested wording</Label>
            {item.suggested_wording}
          </p>
        )}
        {item.likely_attack && (
          <p>
            <Label>Likely attack</Label>
            {item.likely_attack}
          </p>
        )}
        {item.suggested_reply && (
          <p>
            <Label>Suggested reply</Label>
            {item.suggested_reply}
          </p>
        )}
        {item.type === "get approval" && item.approver && (
          <p>
            <Label>Approver</Label>
            {item.approver}
          </p>
        )}
        {item.rules.length > 0 && (
          <p>
            <RuleTags rules={item.rules} />
          </p>
        )}
        {item.why && (
          <details>
            <summary className="select-none text-sm text-accent-text">Why this matters</summary>
            <p className="mt-1 opacity-90">{item.why}</p>
          </details>
        )}
      </div>
    </li>
  );
}

function TabPanel({ tabKey, report }: { tabKey: TabKey; report: Report }) {
  const tab = report.tabs[tabKey];
  const items = sortItems(tab.items);
  const { note } = TABS[tabKey];
  return (
    <div className="space-y-8">
      {note && <p className="text-sm opacity-70">{note}</p>}

      <section>
        <h3 className="mb-2 font-semibold">Overall assessment</h3>
        <p className="max-w-2xl text-[15px]">{tab.assessment}</p>
      </section>

      <section>
        <h3 className="mb-3 font-semibold">What to do</h3>
        {items.length ? (
          <div className="space-y-6">
            {GROUPS.map(({ type, heading }) => {
              const group = items.filter((d) => d.type === type);
              if (!group.length) return null;
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
                    {group.map((d) => (
                      <ItemCard key={d.id} item={d} />
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

  // Reviews saved before the to-do list format have no `items` and can't be shown.
  if (!report?.tabs || !Array.isArray(report.tabs.regulators?.items)) {
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
    const items = report.tabs[k].items;
    return {
      key: k,
      rating: tabRating(items),
      top: sortItems(ratedItems(items))[0]?.action ?? null,
      count: items.length,
    };
  });

  const headline = report.headline ?? "Needs changes";
  const { rewords, sources, approvers } = pathToVerdict(report);
  const steps = [
    rewords > 0 && `reword ${rewords} ${rewords === 1 ? "line" : "lines"}`,
    sources > 0 && `hold ${sources} ${sources === 1 ? "source" : "sources"}`,
    approvers.length > 0 && `get approval from ${joinAnd(approvers)}`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-8">
      <div className="border-t border-fg pt-6">
        <h2 className={`big-title text-6xl sm:text-7xl ${verdictClass(headline)}`}>{headline}</h2>
        <p className="mt-4 max-w-2xl text-[15px]">
          <span className="font-semibold">Bottom line: </span>
          {report.bottom_line}
        </p>
        {steps.length > 0 && (
          <p className="mt-4 max-w-2xl text-[15px]">
            <span className="font-semibold">Before launch: </span>
            {steps.join(" · ")}
          </p>
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
