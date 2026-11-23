import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { deleteThought, getAttachmentBlob } from '../../core/repository';
import { REGION_META, type Attachment, type ThoughtNode } from '../../core/types';
import { formatBytes, formatDate } from '../format';

interface NodeInspectorProps {
  node: ThoughtNode | null;
  thoughts: ThoughtNode[];
  onClose: () => void;
  onFocus: (id: string) => void;
}

export function NodeInspector({ node, thoughts, onClose, onFocus }: NodeInspectorProps) {
  const byId = useMemo(() => new Map(thoughts.map((item) => [item.id, item])), [thoughts]);

  const linked = node
    ? node.links
        .map((id) => byId.get(id))
        .filter((item): item is ThoughtNode => Boolean(item))
    : [];
  const backlinks = node
    ? thoughts.filter((item) => item.id !== node.id && item.links.includes(node.id))
    : [];

  async function handleDelete() {
    if (!node) return;
    const confirmed = window.confirm(
      `Delete "${node.title}" and its local attachments?`,
    );
    if (!confirmed) return;
    await deleteThought(node.id);
    onClose();
  }

  return (
    <div
      className={`absolute inset-y-0 right-0 z-30 w-full max-w-[420px] p-2 transition-transform duration-300 ease-out sm:p-3 ${
        node ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-[105%]'
      }`}
      aria-hidden={!node}
    >
      <aside className="hud-panel flex h-full flex-col overflow-hidden">
        {node && (
          <>
            <div
              className="h-1 w-full shrink-0"
              style={{
                background: `linear-gradient(90deg, ${REGION_META[node.region].accent}, transparent)`,
              }}
            />

            <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${REGION_META[node.region].accent}1f`,
                      color: REGION_META[node.region].accent,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: REGION_META[node.region].accent }}
                    />
                    {REGION_META[node.region].label}
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] capitalize text-slate-400">
                    {node.type}
                  </span>
                  {node.moodScore !== null && <MoodBadge score={node.moodScore} />}
                </div>
                <h2 className="mt-2 text-lg font-semibold leading-snug text-white">
                  {node.title}
                </h2>
                <p className="mt-1 text-[11px] text-slate-500">{formatDate(node.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close inspector"
                className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 transition hover:border-white/25 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-4">
              {node.content && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                  {node.content}
                </p>
              )}

              {node.tags.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {node.tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400"
                    >
                      #{tag}
                    </li>
                  ))}
                </ul>
              )}

              {node.attachments.length > 0 && (
                <section className="mt-4">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Attachments
                  </h3>
                  <ul className="mt-1.5 flex flex-wrap gap-2">
                    {node.attachments.map((attachment) => (
                      <li key={attachment.id}>
                        <AttachmentTile attachment={attachment} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(linked.length > 0 || backlinks.length > 0) && (
                <section className="mt-4 flex flex-col gap-3">
                  {linked.length > 0 && (
                    <ConnectionList
                      title={`Linked · ${linked.length}`}
                      nodes={linked}
                      onFocus={onFocus}
                    />
                  )}
                  {backlinks.length > 0 && (
                    <ConnectionList
                      title={`Referenced by · ${backlinks.length}`}
                      nodes={backlinks}
                      onFocus={onFocus}
                    />
                  )}
                </section>
              )}
            </div>

            <div
              className="mt-auto flex items-center gap-2 border-t px-4 py-3"
              style={{ borderColor: 'var(--hud-border)' }}
            >
              <button
                type="button"
                onClick={() => onFocus(node.id)}
                className="flex-1 rounded-lg border px-3 py-1.5 text-xs text-slate-300 transition hover:text-white"
                style={{ borderColor: 'var(--hud-border)' }}
              >
                Aim camera
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDelete();
                }}
                className="rounded-lg border border-rose-500/25 px-3 py-1.5 text-xs text-rose-300 transition hover:border-rose-400/60 hover:text-rose-200"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function ConnectionList({
  title,
  nodes,
  onFocus,
}: {
  title: string;
  nodes: ThoughtNode[];
  onFocus: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </h3>
      <ul className="mt-1.5 flex flex-col gap-1">
        {nodes.map((node) => {
          const meta = REGION_META[node.region];
          return (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onFocus(node.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.accent }}
                />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
                  {node.title}
                </span>
                <span className="shrink-0 text-[10px] text-slate-500">{meta.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
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
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
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
