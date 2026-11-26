import { useRef, useState } from 'react';
import { formatBytes } from '../format';

interface ImportPanelProps {
  files: File[];
  text: string;
  stage: string | null;
  busy: boolean;
  error: string | null;
  onFilesChange: (files: File[]) => void;
  onTextChange: (text: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

/**
 * Import dialog. All files in one batch go to the AI together, so it can build
 * Stars → Planets → Moons instead of dumping each file into its own topic.
 */
export function ImportPanel({
  files,
  text,
  stage,
  busy,
  error,
  onFilesChange,
  onTextChange,
  onSubmit,
  onClose,
}: ImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function addFiles(incoming: File[]) {
    if (incoming.length === 0) return;
    onFilesChange([...files, ...incoming]);
  }

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        addFiles(Array.from(event.dataTransfer.files ?? []));
      }}
    >
      <div
        className={`hud-panel flex w-full max-w-xl flex-col gap-3 p-5 ${
          dragging ? 'ring-2 ring-indigo-400/60' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Import documents</h2>
            <p className="text-xs text-slate-400">
              PDF, DOCX, PPTX, TXT/MD and images are read locally, then grouped into one Star (topic)
              with Planets (units) and Moons (files).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 transition hover:text-white disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <div
          className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/25 p-4 text-center"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            addFiles(Array.from(event.dataTransfer.files ?? []));
          }}
        >
          <p className="text-sm text-slate-300">Drop files here</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:text-white"
          >
            Or browse files
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.docx,.pptx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.gif"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className="scroll-thin flex max-h-40 flex-col gap-1 overflow-y-auto">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-300"
              >
                <span className="grid h-6 w-6 place-items-center rounded bg-white/10 text-[10px]">
                  📄
                </span>
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-[10px] text-slate-500">
                  {formatBytes(file.size)}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onFilesChange(files.filter((_, current) => current !== index))}
                  className="shrink-0 text-slate-500 transition hover:text-rose-300 disabled:opacity-40"
                  aria-label={`Remove ${file.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <textarea
          className="field resize-none"
          rows={3}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Optional: paste notes or a summary to import alongside the files…"
        />

        <p className="text-[10px] leading-relaxed text-slate-500">
          Scanned PDFs and image-only decks have no text layer. Those files are reported as
          unreadable and the AI is told not to describe their contents. Very large files are
          trimmed (40k characters per file, 120k per batch) so the request stays inside the
          serverless body limit.
        </p>

        {stage && (
          <p className="flex items-center gap-2 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] text-indigo-200">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-indigo-300 border-t-transparent" />
            {stage}
          </p>
        )}
        {error && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || (files.length === 0 && !text.trim())}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: 'var(--hud-accent)' }}
          >
            {busy ? 'Organizing…' : `Organize ${files.length + (text.trim() ? 1 : 0) || ''} item(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
