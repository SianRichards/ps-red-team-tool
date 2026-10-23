import { useEffect, useRef } from "react";

const heading = "mb-1 font-semibold";

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
      className="m-auto w-[min(90vw,40rem)] max-h-[85vh] rounded-3xl border border-fg bg-page p-0 text-fg backdrop:bg-black/60"
    >
      <div className="relative px-6 py-6 sm:px-10">
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-fg hover:bg-fg hover:text-page"
        >
          <span aria-hidden="true">×</span>
        </button>
        <h2 id="about-title" className="big-title mb-6 pr-10 text-4xl">
          About this tool
        </h2>
        <div className="space-y-5">
          <section>
            <h3 className={heading}>What's red teaming?</h3>
            <p>
              Getting someone to attack your work on purpose, before your opponents do. It comes from military and
              security testing: one team plays the enemy to find weak spots.
            </p>
          </section>
          <section>
            <h3 className={heading}>What does this tool do?</h3>
            <p>
              It reads a draft ad, poster, script or post the way critics will. It flags weak points and suggests fixes
              that keep the message sharp.
            </p>
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
            <p>It's not a lawyer nor the final say. It flags risks; your team decides.</p>
          </section>
        </div>
      </div>
    </dialog>
  );
}
