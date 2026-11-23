import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { addAttachment, createThought, normalizeTags } from '../../core/repository';
import {
  MOOD_MAX,
  MOOD_MIN,
  REGIONS,
  REGION_META,
  THOUGHT_TYPES,
  type Region,
  type ThoughtType,
} from '../../core/types';
import { formatBytes } from '../format';

export function AddNodeForm() {
  const [type, setType] = useState<ThoughtType>('thought');
  const [region, setRegion] = useState<Region>('prefrontal');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [mood, setMood] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle && !trimmedContent) {
      setError('Add a title or some content before saving.');
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

      setTitle('');
      setContent('');
      setTagInput('');
      setFiles([]);
      setMood(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this node.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel flex flex-col gap-4 p-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Capture a node</h2>
          <span className="text-[11px] text-slate-500">saved to IndexedDB</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Brain-dump a thought, feeling or note. Attachments are stored locally on this device.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1" role="group" aria-label="Node type">
        {THOUGHT_TYPES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setType(option)}
            aria-pressed={type === option}
            className={`rounded-lg px-2 py-1.5 text-xs font-medium capitalize transition ${
              type === option
                ? 'bg-white/15 text-white shadow-sm shadow-black/30'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-400">
        Region
        <select
          className="field"
          value={region}
          onChange={(event) => setRegion(event.target.value as Region)}
        >
          {REGIONS.map((option) => (
            <option key={option} value={option} className="bg-slate-900">
              {REGION_META[option].label} — {REGION_META[option].description}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-400">
        Title
        <input
          className="field"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Short title"
          maxLength={120}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-400">
        Content
        <textarea
          className="field resize-y"
          rows={4}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="What's on your mind?"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-400">
        Tags
        <input
          className="field"
          value={tagInput}
          onChange={(event) => setTagInput(event.target.value)}
          placeholder="comma, separated, tags"
        />
      </label>

      {type === 'feeling' && (
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-400">
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

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Saving…' : 'Save node'}
      </button>
    </form>
  );
}

interface FilePickerProps {
  files: File[];
  onChange: (files: File[]) => void;
}

function FilePicker({ files, onChange }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const previews = useMemo(
    () =>
      files
        .filter((file) => file.type.startsWith('image/'))
        .map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(
    () => () => {
      for (const preview of previews) URL.revokeObjectURL(preview.url);
    },
    [previews],
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-slate-400">Attachment</span>
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
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 text-xs text-slate-300 transition hover:border-indigo-400/40 hover:text-white"
      >
        📎 Attach a file or image
      </button>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((file, index) => {
            const preview = previews.find((item) => item.file === file);
            return (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-xs text-slate-300"
              >
                {preview ? (
                  <img src={preview.url} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <span className="grid h-8 w-8 place-items-center rounded bg-white/10">📄</span>
                )}
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-[10px] text-slate-500">{formatBytes(file.size)}</span>
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
