import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { addAttachment, createThought, normalizeTags } from '../../core/repository';
import {
  MOOD_MAX,
  MOOD_MIN,
  REGIONS,
  REGION_META,
  THOUGHT_TYPES,
  type Region,
  type ThoughtNode,
  type ThoughtType,
} from '../../core/types';
import { formatBytes } from '../format';

interface QuickCaptureProps {
  onSaved?: (node: ThoughtNode) => void;
}

export function QuickCapture({ onSaved }: QuickCaptureProps) {
  const [open, setOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 768,
  );
  const [type, setType] = useState<ThoughtType>('thought');
  const [region, setRegion] = useState<Region>('prefrontal');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [mood, setMood] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const trimmedContent = content.trim();
    const trimmedTitle = title.trim();
    if (!trimmedContent && !trimmedTitle) {
      setError('Write something before capturing.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const node = await createThought({
        title: trimmedTitle,
        content: trimmedContent,
        type,
        region,
        tags: normalizeTags(tagInput.split(/[,\s]+/)),
        moodScore: type === 'feeling' ? mood : null,
      });

      for (const file of files) {
        await addAttachment(node.id, file);
      }

      setContent('');
      setTitle('');
      setTagInput('');
      setFiles([]);
      setMood(0);
      setShowMore(false);
      onSaved?.(node);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this node.');
    } finally {
      setBusy(false);
    }
  }

  function handleTextareaShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  const meta = REGION_META[region];

  return (
    <div className="hud-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2">
          <span
            className="grid h-6 w-6 place-items-center rounded-full text-[11px]"
            style={{ backgroundColor: `${meta.accent}24`, color: meta.accent }}
          >
            ✎
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
            Quick capture
          </span>
        </span>
        <span className="text-[10px] text-slate-500">{open ? '▾' : '▴'}</span>
      </button>

      {open && (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex flex-col gap-2.5 border-t px-3 pb-3 pt-2.5"
          style={{ borderColor: 'var(--hud-border)' }}
        >
          <div
            className="grid grid-cols-3 gap-1 rounded-lg bg-black/25 p-0.5"
            role="group"
            aria-label="Node type"
          >
            {THOUGHT_TYPES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                aria-pressed={type === option}
                className={`rounded-md px-2 py-1 text-[11px] font-medium capitalize transition ${
                  type === option
                    ? 'bg-white/15 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1">
            {REGIONS.map((option) => {
              const regionMeta = REGION_META[option];
              const active = region === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRegion(option)}
                  aria-pressed={active}
                  title={regionMeta.description}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition ${
                    active
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: regionMeta.accent }}
                  />
                  {regionMeta.label}
                </button>
              );
            })}
          </div>

          <textarea
            className="field resize-none"
            rows={2}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={handleTextareaShortcut}
            placeholder={`New ${type} in ${meta.label.toLowerCase()}…`}
          />

          {showMore && (
            <>
              <input
                className="field"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title (optional — defaults to first line)"
                maxLength={120}
              />
              <input
                className="field"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                placeholder="Tags: comma, separated"
              />
              {type === 'feeling' && (
                <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-400">
                  <span className="flex items-center justify-between">
                    Mood
                    <span className="text-slate-200">
                      {mood > 0 ? `+${mood}` : mood} / {MOOD_MAX}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={MOOD_MIN}
                    max={MOOD_MAX}
                    step={1}
                    value={mood}
                    onChange={(event) => setMood(Number(event.target.value))}
                    className="accent-rose-400"
                  />
                </label>
              )}
              <FilePicker files={files} onChange={setFiles} />
            </>
          )}

          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowMore((value) => !value)}
              className="text-[11px] text-slate-400 transition hover:text-slate-200"
            >
              {showMore ? '− Fewer options' : '+ More options'}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: 'var(--hud-accent)' }}
            >
              {busy ? 'Saving…' : 'Capture'}
            </button>
          </div>

          <p className="text-[10px] text-slate-500">⌘/Ctrl + Enter · stored in IndexedDB</p>
        </form>
      )}
    </div>
  );
}

interface FilePickerProps {
  files: File[];
  onChange: (files: File[]) => void;
}

function FilePicker({ files, onChange }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Array<{ file: File; url: string }>>([]);

  useEffect(() => {
    const next = files
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => {
      for (const preview of next) URL.revokeObjectURL(preview.url);
    };
  }, [files]);

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          if (picked.length > 0) onChange([...files, ...picked]);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-dashed px-2 py-1.5 text-[11px] text-slate-300 transition hover:text-white"
        style={{ borderColor: 'var(--hud-border)' }}
      >
        📎 Attach a file or image
      </button>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((file, index) => {
            const preview = previews.find((item) => item.file === file);
            return (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-300"
              >
                {preview ? (
                  <img src={preview.url} alt="" className="h-6 w-6 rounded object-cover" />
                ) : (
                  <span className="grid h-6 w-6 place-items-center rounded bg-white/10 text-[10px]">
                    📄
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-[10px] text-slate-500">
                  {formatBytes(file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(files.filter((_, current) => current !== index))}
                  className="shrink-0 text-slate-500 transition hover:text-rose-300"
                  aria-label={`Remove ${file.name}`}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
