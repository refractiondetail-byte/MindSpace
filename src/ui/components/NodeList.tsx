import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { deleteThought, getAttachmentBlob } from '../../core/repository';
import { REGION_META, type Attachment, type ThoughtNode } from '../../core/types';
import { formatBytes, formatDate } from '../format';

interface NodeListProps {
  thoughts: ThoughtNode[];
  isLoading: boolean;
  hasNodes: boolean;
}

export function NodeList({ thoughts, isLoading, hasNodes }: NodeListProps) {
  if (isLoading) {
    return <div className="glass-panel p-6 text-sm text-slate-400">Opening the local database…</div>;
  }

  if (!hasNodes) {
    return (
      <div className="glass-panel p-10 text-center">
        <p className="text-2xl">🧠</p>
        <p className="mt-2 text-sm font-medium text-white">Your brain is empty</p>
        <p className="mt-1 text-xs text-slate-400">
          Capture your first thought, feeling or note with the form.
        </p>
      </div>
    );
  }

  if (thoughts.length === 0) {
    return (
      <div className="glass-panel p-6 text-sm text-slate-400">
        No nodes match that search. Try another word or region.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {thoughts.map((thought) => (
        <li key={thought.id}>
          <NodeCard thought={thought} />
        </li>
      ))}
    </ul>
  );
}

function NodeCard({ thought }: { thought: ThoughtNode }) {
  const meta = REGION_META[thought.region];

  async function handleDelete() {
    const confirmed = window.confirm(`Delete "${thought.title}" and its local attachments?`);
    if (!confirmed) return;
    await deleteThought(thought.id);
  }

  return (
    <article
      className="glass-panel p-4"
      style={{ borderLeftWidth: 3, borderLeftColor: meta.accent }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: `${meta.accent}1f`, color: meta.accent }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.accent }} />
              {meta.label}
            </span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] capitalize text-slate-400">
              {thought.type}
            </span>
            {thought.moodScore !== null && <MoodBadge score={thought.moodScore} />}
          </div>
          <h3 className="mt-2 truncate text-base font-semibold text-white">{thought.title}</h3>
        </div>
        <button
          type="button"
          onClick={() => {
            void handleDelete();
          }}
          className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 transition hover:border-rose-400/40 hover:text-rose-300"
          aria-label={`Delete ${thought.title}`}
        >
          Delete
        </button>
      </div>

      {thought.content && (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
          {thought.content}
        </p>
      )}

      {thought.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {thought.tags.map((tag) => (
            <li key={tag} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400">
              #{tag}
            </li>
          ))}
        </ul>
      )}

      {thought.attachments.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {thought.attachments.map((attachment) => (
            <li key={attachment.id}>
              <AttachmentTile attachment={attachment} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] text-slate-500">
        {formatDate(thought.createdAt)}
        {thought.links.length > 0 ? ` · ${thought.links.length} linked` : ''}
      </p>
    </article>
  );
}

function MoodBadge({ score }: { score: number }) {
  const tone =
    score > 0
      ? 'bg-emerald-500/10 text-emerald-300'
      : score < 0
        ? 'bg-rose-500/10 text-rose-300'
        : 'bg-white/5 text-slate-400';

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      mood {score > 0 ? `+${score}` : score}
    </span>
  );
}

function AttachmentTile({ attachment }: { attachment: Attachment }) {
  const blob = useLiveQuery(() => getAttachmentBlob(attachment.id), [attachment.id]);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (attachment.kind === 'image') {
    return url ? (
      <img
        src={url}
        alt={attachment.name}
        title={`${attachment.name} · ${formatBytes(attachment.size)}`}
        className="h-20 w-20 rounded-lg object-cover ring-1 ring-white/10"
      />
    ) : (
      <div className="h-20 w-20 animate-pulse rounded-lg bg-white/5" />
    );
  }

  return (
    <a
      href={url ?? undefined}
      download={attachment.name}
      className={`inline-flex max-w-[220px] items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs ${
        url ? 'text-slate-200 hover:border-indigo-400/40' : 'text-slate-500'
      }`}
    >
      <span>📄</span>
      <span className="min-w-0 truncate">{attachment.name}</span>
      <span className="shrink-0 text-[10px] text-slate-500">{formatBytes(attachment.size)}</span>
    </a>
  );
}
