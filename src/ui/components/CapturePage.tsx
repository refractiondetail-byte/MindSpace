import { useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addAttachment, createThought, linkThoughts, listThoughts } from '../../core/repository';
import {
  REGIONS,
  REGION_META,
  THOUGHT_TYPES,
  type Region,
  type ThoughtNode,
  type ThoughtType,
} from '../../core/types';
import { formatBytes } from '../format';

interface CapturePageProps {
  onClose: () => void;
  onSaved?: (node: ThoughtNode) => void;
}

const REGION_KEYWORDS: Record<Region, string[]> = {
  prefrontal: ['plan', 'goal', 'todo', 'task', 'schedule', 'deadline', 'motivation', 'habit', 'roadmap'],
  hippocampus: ['note', 'study', 'school', 'class', 'lecture', 'file', 'document', 'research', 'learn', 'book', 'memory'],
  limbic: ['mood', 'feeling', 'reflect', 'journal', 'emotion', 'sad', 'happy', 'anxious', 'grateful', 'diary'],
  parietal: ['project', 'idea', 'design', 'build', 'code', 'app', 'prototype', 'experiment', 'invention'],
};

function detectRegion(text: string, fileNames: string[]): Region {
  const corpus = `${text} ${fileNames.join(' ')}`.toLowerCase();
  let best: Region = 'hippocampus';
  let bestScore = -1;
  for (const region of REGIONS) {
    const score = REGION_KEYWORDS[region].reduce(
      (sum, keyword) => sum + (corpus.includes(keyword) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      best = region;
      bestScore = score;
    }
  }
  return best;
}

export function CapturePage({ onClose, onSaved }: CapturePageProps) {
  const thoughts = useLiveQuery(() => listThoughts(), []) ?? [];
  const [kind, setKind] = useState<'topic' | 'attachment'>('topic');
  const [dragging, setDragging] = useState(false);
  const [type, setType] = useState<ThoughtType>('note');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedRegion, setDetectedRegion] = useState<Region | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleTopicSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmedContent = content.trim();
    const trimmedTitle = title.trim();
    if (!trimmedContent && !trimmedTitle && files.length === 0) {
      setError('Add text or at least one file before capturing.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const region = detectRegion(trimmedContent || trimmedTitle, files.map((file) => file.name));
      setDetectedRegion(region);
      const node = await createThought({
        title: trimmedTitle,
        content: trimmedContent,
        type,
        region,
        tags: tagInput.trim() ? tagInput.split(/[,\\s]+/).filter(Boolean) : [],
        moodScore: null,
      });

      for (const file of files) {
        await addAttachment(node.id, file);
      }

      const related = thoughts
        .filter((candidate) => candidate.id !== node.id)
        .filter((candidate) =>
          candidate.region === node.region ||
          candidate.tags.some((tag) => node.tags.includes(tag)),
        )
        .slice(0, 4);
      for (const candidate of related) {
        await linkThoughts(node.id, candidate.id);
      }

      setContent('');
      setTitle('');
      setTagInput('');
      setFiles([]);
      onSaved?.(node);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this capture.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAttachmentSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!targetId) {
      setError('Choose a topic to attach to.');
      return;
    }
    const trimmedContent = content.trim();
    const trimmedTitle = title.trim();
    if (!trimmedContent && files.length === 0 && !linkUrl.trim()) {
      setError('Add text, a file, or a link to attach.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (trimmedContent) {
        const blob = new Blob([trimmedContent], { type: 'text/plain' });
        const textFile = new File([blob], trimmedTitle ? `${trimmedTitle}.txt` : 'note.txt', {
          type: 'text/plain',
        });
        await addAttachment(targetId, textFile);
      }
      for (const file of files) {
        await addAttachment(targetId, file);
      }
      if (linkUrl.trim()) {
        const url = linkUrl.trim();
        const linkFile = new File([url], url, { type: 'text/uri-list' });
        await addAttachment(targetId, linkFile);
      }

      const target = thoughts.find((node) => node.id === targetId) ?? null;
      setContent('');
      setTitle('');
      setTagInput('');
      setFiles([]);
      setLinkUrl('');
      setTargetId(null);
      if (target) onSaved?.(target);
      else onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not attach to this topic.');
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (dropped.length > 0) setFiles((current) => [...current, ...dropped]);
  }

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div
        className={`hud-panel flex w-full max-w-2xl flex-col gap-4 p-5 transition ${
          dragging ? 'ring-2 ring-indigo-400/60' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Capture</h2>
            <p className="text-xs text-slate-400">
              Create a new topic, or attach files/text to an existing topic.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 transition hover:border-white/25 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/25 p-0.5" role="group" aria-label="Capture kind">
          <button
            type="button"
            onClick={() => setKind('topic')}
            aria-pressed={kind === 'topic'}
            className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
              kind === 'topic' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            New topic
          </button>
          <button
            type="button"
            onClick={() => setKind('attachment')}
            aria-pressed={kind === 'attachment'}
            className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
              kind === 'attachment' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Add attachment
          </button>
        </div>

        {kind === 'topic' ? (
          <form onSubmit={handleTopicSubmit} className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/25 p-0.5" role="group" aria-label="Node type">
              {THOUGHT_TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setType(option)}
                  aria-pressed={type === option}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium capitalize transition ${
                    type === option ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <input
              className="field"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title (optional)"
              maxLength={120}
            />

            <textarea
              ref={textareaRef}
              className="field resize-none"
              rows={5}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Paste or type text to capture…"
            />

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const picked = Array.from(event.target.files ?? []);
                if (picked.length > 0) setFiles((current) => [...current, ...picked]);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[11px] text-slate-300 transition hover:text-white"
              style={{ borderColor: 'var(--hud-border)' }}
            >
              📎 Upload files
            </button>

            {files.length > 0 && (
              <ul className="flex flex-col gap-1">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-300"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded bg-white/10 text-[10px]">📄</span>
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-[10px] text-slate-500">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((current) => current.filter((_, currentIdx) => currentIdx !== index))}
                      className="shrink-0 text-slate-500 transition hover:text-rose-300"
                      aria-label={`Remove ${file.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <input
              className="field"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="Tags: comma, separated (optional)"
            />

            {detectedRegion && (
              <p className="text-[11px] text-slate-400">
                Auto-organized into{' '}
                <span className="font-semibold" style={{ color: REGION_META[detectedRegion].accent }}>
                  {REGION_META[detectedRegion].label}
                </span>
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
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: 'var(--hud-accent)' }}
              >
                {busy ? 'Organizing…' : 'Capture & organize'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAttachmentSubmit} className="flex flex-col gap-3">
            <div>
              <p className="text-[11px] font-medium text-slate-400">Choose a topic</p>
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-1">
                {thoughts.length === 0 ? (
                  <p className="px-2 py-1.5 text-[11px] text-slate-500">No topics yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {thoughts.map((node) => (
                      <li key={node.id}>
                        <button
                          type="button"
                          onClick={() => setTargetId(node.id)}
                          aria-pressed={targetId === node.id}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition ${
                            targetId === node.id
                              ? 'bg-white/10 text-white'
                              : 'text-slate-300 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: REGION_META[node.region].accent }}
                          />
                          <span className="min-w-0 flex-1 truncate">{node.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <input
              className="field"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Attachment title (optional)"
              maxLength={120}
            />

            <textarea
              ref={textareaRef}
              className="field resize-none"
              rows={4}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Optional text to attach…"
            />

            <input
              className="field"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="Optional link (https://…)"
            />

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const picked = Array.from(event.target.files ?? []);
                if (picked.length > 0) setFiles((current) => [...current, ...picked]);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[11px] text-slate-300 transition hover:text-white"
              style={{ borderColor: 'var(--hud-border)' }}
            >
              📎 Upload files
            </button>

            {files.length > 0 && (
              <ul className="flex flex-col gap-1">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-300"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded bg-white/10 text-[10px]">📄</span>
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-[10px] text-slate-500">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((current) => current.filter((_, currentIdx) => currentIdx !== index))}
                      className="shrink-0 text-slate-500 transition hover:text-rose-300"
                      aria-label={`Remove ${file.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
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
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: 'var(--hud-accent)' }}
              >
                {busy ? 'Attaching…' : 'Add planet'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
