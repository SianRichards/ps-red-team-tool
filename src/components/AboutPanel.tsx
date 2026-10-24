import { useEffect, useRef } from "react";

const heading = "mb-1 font-semibold";
const link = "text-accent-text underline-offset-2 hover:underline";

const rulings = [
  {
    name: "Viva!",
    year: 2023,
    href: "https://www.asa.org.uk/rulings/viva--g23-1199062-viva-.html",
    what: "A gory parody yoghurt ad was banned for shocking and distressing viewers, including children.",
  },
  {
    name: "PETA",
    year: 2023,
    href: "https://www.asa.org.uk/rulings/people-for-the-ethical-treatment-of-animals--peta--foundation-g23-1196052-people-for-the-ethical-treatment-of-animals--peta--foundation.html",
    what: "A billboard showing a dead cat in place of a fish was cleared, as it was seen as mild and not gruesome.",
  },
  {
    name: "RSPCA",
    year: 2025,
    href: "https://www.asa.org.uk/rulings/royal-society-for-the-prevention-of-cruelty-to-animals-g24-1260091-royal-society-for-the-prevention-of-cruelty-to-animals.html",
    what: "An ad about farm animal welfare was cleared, as its standards and audit data backed it up.",
  },
  {
    name: "AHDB",
    year: 2026,
    href: "http://asa.org.uk/rulings/agriculture-and-horticulture-development-board--a25-1278659--agriculture-and-horticulture-development-board.html",
    what: "Carbon footprint claims in press ads for British beef and dairy were ruled misleading. Its other claims were cleared.",
  },
];

export default function AboutPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(90vw,40rem)] max-h-[85vh] overflow-hidden rounded-3xl border border-line bg-page p-0 text-fg backdrop:bg-black/60"
    >
      <div className="about-scroll my-4 mr-3 max-h-[calc(85vh-2rem)] overflow-y-auto overscroll-contain pb-2 pl-6 pr-3 sm:pl-10 sm:pr-7">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-page pb-6 pt-2">
          <h2 id="about-title" className="big-title text-4xl">
            About this tool
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-fg text-xl leading-none hover:bg-fg hover:text-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
          >
            <span aria-hidden="true" className="text-[32px] leading-none">×</span>
          </button>
        </div>
        <div className="space-y-5">
          <section>
            <h3 className={heading}>What's red teaming?</h3>
            <p>
              Getting someone to attack your work on purpose, before your opponents do. It comes from military and
              security testing: one team plays the enemy to find the risks.
            </p>
          </section>
          <section>
            <h3 className={heading}>What does this tool do?</h3>
            <p>
              It reads a draft ad, poster, script or post the way critics will. It flags risks and suggests fixes
              that keep the message sharp.
            </p>
          </section>
          <section>
            <h3 className={heading}>Who does it think like?</h3>
            <p>It reviews your ad from three points of view, matching the three tabs in the report.</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                <strong>Regulators</strong>: The{" "}
                <a
                  href="https://www.asa.org.uk/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-text underline-offset-2 hover:underline"
                >
                  ASA
                </a>
                , which can ban ads after a complaint, and media owners like TfL or Meta, who can refuse or remove them.
                This is the most tested part of the tool.
              </li>
              <li>
                <strong>Public &amp; press</strong>: How ordinary people and journalists might react, from being moved
                to calling it preachy, exaggerated or hypocritical.
              </li>
              <li>
                <strong>Industry &amp; critics</strong>: What farming bodies and opponents are likely to say, such as
                "the footage is old", "UK standards are the highest" or "it's an attack on farmers".
              </li>
            </ul>
            <p className="mt-2 text-sm text-muted">
              Public and industry views are likely reactions, not tested against real responses.
            </p>
          </section>
          <section>
            <h3 className={heading}>Built for UK ads</h3>
            <p>
              It assumes your ad will be seen by people in the UK. It checks against UK rules (the ASA's CAP Code) and
              UK public and industry reactions. You can test an ad from another country, but it will still be judged
              as if it were running in the UK.
            </p>
          </section>
          <section>
            <h3 className={heading}>What does it check against?</h3>
            <p>It uses an AI model given a fixed set of reference material:</p>
            <ul className="mt-1 list-disc space-y-2 pl-5">
              <li>
                <a
                  href="https://www.asa.org.uk/codes-and-rulings/advertising-codes/non-broadcast-code.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={link}
                >
                  CAP Code
                </a>
                , as published in October 2026. These sections: Compliance, Misleading advertising, Harm and offence,
                Children, Privacy, Political advertisements, Environmental claims, and Food and health claims.
              </li>
              <li>
                <strong>ASA guidance</strong> on fear and distress in ads, and on charity and campaign ads.
              </li>
              <li>
                <strong>Past ASA rulings</strong>:
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {rulings.map((r) => (
                    <li key={r.href}>
                      <a href={r.href} target="_blank" rel="noopener noreferrer" className={link}>
                        {r.name}, {r.year}
                      </a>
                      : {r.what}
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              <li>It only knows the rulings listed above, not every ASA decision.</li>
              <li>It doesn't cover TV or radio rules.</li>
              <li>
                It can't see your evidence, so it flags claims to check rather than judging them true or false.
              </li>
            </ul>
          </section>
          <section>
            <h3 className={heading}>What can it help prevent?</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>An ad banned after an ASA complaint, which hands industry a PR win</li>
              <li>Legal threats over claims you can't fully back up</li>
              <li>Ads being pulled</li>
              <li>Press stories about exaggerated stats or unclear sources</li>
              <li>Messages that put off the people you're trying to reach</li>
            </ul>
          </section>
          <section>
            <h3 className={heading}>What it isn't</h3>
            <p>A lawyer or the final say. It flags risks; your team decides.</p>
          </section>
        </div>
      </div>
    </dialog>
  );
}
