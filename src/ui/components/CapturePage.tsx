import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addAttachment, createThought, linkThoughts, listThoughts } from '../../core/repository';
import { REGIONS, REGION_META, type Region, type ThoughtNode } from '../../core/types';
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

function detectRegion(fileNames: string[]): Region {
  const corpus = fileNames.join(' ').toLowerCase();
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
  const [files, setFiles] = useState<File[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTopicSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (files.length === 0 && !linkUrl.trim()) {
      setError('Drop at least one file or paste a link.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const region = detectRegion([...files.map((file) => file.name), linkUrl]);
      const node = await createThought({
        title: files[0]?.name ?? (linkUrl.trim() ? linkUrl.trim() : 'Captured files'),
        content: '',
        type: 'note',
        region,
        tags: [],
        moodScore: null,
      });

      for (const file of files) {
        await addAttachment(node.id, file);
      }
      if (linkUrl.trim()) {
        const url = linkUrl.trim();
        const linkFile = new File([url], url, { type: 'text/uri-list' });
        await addAttachment(node.id, linkFile);
      }

      const related = thoughts
        .filter((candidate) => candidate.id !== node.id)
        .filter((candidate) => candidate.region === node.region)
        .slice(0, 4);
      for (const candidate of related) {
        await linkThoughts(node.id, candidate.id);
      }

      setFiles([]);
      setLinkUrl('');
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
    if (files.length === 0 && !linkUrl.trim()) {
      setError('Drop at least one file or paste a link.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        await addAttachment(targetId, file);
      }
      if (linkUrl.trim()) {
        const url = linkUrl.trim();
        const linkFile = new File([url], url, { type: 'text/uri-list' });
        await addAttachment(targetId, linkFile);
      }

      const target = thoughts.find((node) => node.id === targetId) ?? null;
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
      onPaste={(event) => {
        const pastedFiles = Array.from(event.clipboardData?.files ?? []);
        if (pastedFiles.length > 0) {
          setFiles((current) => [...current, ...pastedFiles]);
          return;
        }
        const text = event.clipboardData?.getData('text') ?? '';
        if (/^https?:\/\//i.test(text.trim())) setLinkUrl(text.trim());
      }}
    >
      <div
        className={`hud-panel flex w-full max-w-xl flex-col gap-4 p-5 transition ${
          dragging ? 'ring-2 ring-indigo-400/60' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Capture</h2>
            <p className="text-xs text-slate-400">Drop files. AI organizes them automatically.</p>
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

        <div
          className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/20 p-4 text-center"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <p className="text-sm text-slate-300">Drag & drop files here</p>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('capture-file-input') as HTMLInputElement | null;
              el?.click();
            }}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:text-white"
          >
            Or browse
          </button>
          <input
            id="capture-file-input"
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []);
              if (picked.length > 0) setFiles((current) => [...current, ...picked]);
              event.target.value = '';
            }}
          />
        </div>

        <input
          className="field"
          value={linkUrl}
          onChange={(event) => setLinkUrl(event.target.value)}
          placeholder="Or paste a link (https://…)"
        />

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

        {kind === 'attachment' && (
          <div>
            <p className="text-[11px] font-medium text-slate-400">Choose a topic</p>
            <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-1">
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
            type="button"
            disabled={busy || files.length === 0 || (kind === 'attachment' && !targetId)}
            onClick={() => (kind === 'topic' ? handleTopicSubmit() : handleAttachmentSubmit())}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: 'var(--hud-accent)' }}
          >
            {busy ? 'Organizing…' : kind === 'topic' ? 'Capture & organize' : 'Add attachment'}
          </button>
        </div>
      </div>
    </div>
  );
}
