import { useEffect, useMemo, useRef, useState } from "react";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

function size(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileDrop({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const previews = useMemo(
    () => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)),
    [files],
  );
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  function add(list: FileList | null) {
    const picked = Array.from(list ?? []).filter((f) => ACCEPT.includes(f.type));
    if (picked.length) onChange([...files, ...picked]);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload poster, key frames or a PDF"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-8 text-center text-sm transition-colors ${
          over ? "border-red" : "border-line-60 hover:border-fg"
        }`}
      >
        <svg
          aria-hidden
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        <span>Drop poster, key frames or a PDF here, or click to browse</span>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ACCEPT.join(",")}
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />

      {files.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-full border border-line-60 py-1 pl-1 pr-3 text-sm">
              {previews[i] ? (
                <img src={previews[i]!} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line-60 text-[10px] font-semibold">
                  pdf
                </span>
              )}
              <span className="max-w-[16rem] truncate">{f.name}</span>
              <span className="text-muted">{size(f.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="ml-1 text-base leading-none opacity-70 hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
