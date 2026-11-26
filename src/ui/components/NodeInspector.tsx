import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { deleteThought, getAttachmentBlob, updateThought } from '../../core/repository';
import { listNoteVersions, revertToVersion, type NoteVersion } from '../../lib/noteVersions';
import { analyzeGapsWithAI, type GapAnalysisResult, synthesizeTopicWithAI, type SynthesisResult } from '../../lib/ai';
import { recordNoteVersion } from '../../lib/noteVersions';
import type { MindItem } from '../types';
import { REGION_META, type Attachment, type ThoughtNode } from '../../core/types';
import { loadClusterNames } from '../../lib/clusterNames';
import { AiProgressScreen, type AiJobMode } from './AiProgress';
import { ImageViewer } from './ImageViewer';
import { TextViewer } from './TextViewer';
import { formatBytes, formatDate } from '../format';
import { relativeTime } from '../time';

interface NodeInspectorProps {
  node: ThoughtNode | null;
  thoughts: ThoughtNode[];
  /** Last time this node was opened, from the local visit tracker. */
  touchedAt: string | null;
  onClose: () => void;
  onFocus: (id: string) => void;
}

export function NodeInspector({
  node,
  thoughts,
  touchedAt,
  onClose,
  onFocus,
}: NodeInspectorProps) {
  const [viewers, setViewers] = useState<Array<{ id: string; url: string; name: string }>>([]);
  const [textWindows, setTextWindows] = useState<Array<{ id: string; attachment: Attachment }>>([]);
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [gapResult, setGapResult] = useState<GapAnalysisResult | null>(null);
  const [gapLoading, setGapLoading] = useState(false);
  const [gapError, setGapError] = useState<string | null>(null);
  const [synthesisResult, setSynthesisResult] = useState<SynthesisResult | null>(null);
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [aiJob, setAiJob] = useState<{
    mode: AiJobMode;
    topic: string;
    count: number;
    done: boolean;
  } | null>(null);
  const aiJobHideRef = useRef<number | null>(null);
  const [moveTopicSelection, setMoveTopicSelection] = useState<string>('');
  const [newTopicName, setNewTopicName] = useState('');
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetSelection, setMergeTargetSelection] = useState<string>('');
  const [newMergeTopicName, setNewMergeTopicName] = useState('');
  const byId = useMemo(() => new Map(thoughts.map((item) => [item.id, item])), [thoughts]);
  const topicOptions = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const item of thoughts) {
      const mindItem = item as MindItem;
      const name = mindItem.topic || 'Untagged';
      if (!map.has(name)) map.set(name, { name, color: mindItem.topicColor || '#94a3b8' });
    }
    return [...map.values()];
  }, [thoughts]);

  useEffect(() => {
    if (aiJobHideRef.current !== null) window.clearTimeout(aiJobHideRef.current);
    aiJobHideRef.current = null;
    setAiJob(null);
    setShowHistory(false);
    setGapResult(null);
    setGapError(null);
    setSynthesisResult(null);
    setSynthesisError(null);
    setMoveTopicSelection('');
    setNewTopicName('');
    setMergeOpen(false);
    setMergeTargetSelection('');
    setNewMergeTopicName('');
    if (!node) {
      setVersions([]);
      return;
    }
    void listNoteVersions(node.id).then(setVersions);
  }, [node?.id]);

  function finishAiJob(success: boolean) {
    if (aiJobHideRef.current !== null) window.clearTimeout(aiJobHideRef.current);
    aiJobHideRef.current = null;
    if (!success) {
      setAiJob(null);
      return;
    }
    setAiJob((current) => (current ? { ...current, done: true } : current));
    aiJobHideRef.current = window.setTimeout(() => setAiJob(null), 900);
  }

  useEffect(
    () => () => {
      if (aiJobHideRef.current !== null) window.clearTimeout(aiJobHideRef.current);
    },
    [],
  );

  async function handleScanGaps() {
    if (!node) return;
    const mindNode = node as MindItem;
    const topic = mindNode.topic || node.title;
    const topicItems = topicItemsFor(topic);
    setGapLoading(true);
    setGapError(null);
    setAiJob({ mode: 'gaps', topic, count: Math.max(topicItems.length, 1), done: false });
    try {
      const result = await analyzeGapsWithAI({
        topic,
        items: topicItems.length ? topicItems : [{ title: node.title, distilledNote: mindNode.distilledNote, summary: mindNode.summary, extractedText: mindNode.extractedText }],
      });
      setGapResult(result);
      finishAiJob(true);
    } catch (error) {
      setGapError(error instanceof Error ? error.message : String(error));
      finishAiJob(false);
    } finally {
      setGapLoading(false);
    }
  }

  async function handleRevert(version: NoteVersion) {
    if (!node) return;
    await revertToVersion(node.id, version, async (patch) => {
      await updateThought(node.id, patch as Record<string, unknown>);
    });
    const refreshed = await listNoteVersions(node.id);
    setVersions(refreshed);
  }

  function topicItemsFor(topic: string) {
    return thoughts
      .filter((item) => (item as MindItem).topic === topic)
      .map((item) => {
        const mindItem = item as MindItem;
        return {
          title: mindItem.title,
          distilledNote: mindItem.distilledNote,
          summary: mindItem.summary,
          extractedText: mindItem.extractedText,
        };
      });
  }

  async function handleMoveTopic() {
    if (!node) return;
    const mindNode = node as MindItem;
    const targetName =
      moveTopicSelection === '__new__' ? newTopicName.trim() : moveTopicSelection;
    if (!targetName) return;
    const targetTopic = topicOptions.find((topic) => topic.name === targetName);
    const color = targetTopic?.color || mindNode.topicColor || '#94a3b8';
    const parent = thoughts
      .filter((item) => (item as MindItem).topic === targetName)
      .map((item) => item as MindItem)
      .find((item) => item.entryType === 'topic')?.id ?? null;
    await recordNoteVersion(mindNode);
    await updateThought(node.id, { topic: targetName, topicColor: color, parentId: parent });
    setVersions(await listNoteVersions(node.id));
  }

  async function handleMergeTopic() {
    if (!node) return;
    const mindNode = node as MindItem;
    const sourceTopic = mindNode.topic || 'Untagged';
    const targetName =
      mergeTargetSelection === '__new__' ? newMergeTopicName.trim() : mergeTargetSelection;
    if (!targetName || targetName === sourceTopic) return;
    const targetTopic = topicOptions.find((topic) => topic.name === targetName);
    const targetColor = targetTopic?.color || mindNode.topicColor || '#94a3b8';
    const sourceItems = thoughts.filter((item) => (item as MindItem).topic === sourceTopic) as MindItem[];
    const targetItems = thoughts.filter((item) => (item as MindItem).topic === targetName) as MindItem[];
    const relatedUnion = [
      ...new Set([
        ...sourceItems.flatMap((item) => item.relatedIds ?? []),
        ...targetItems.flatMap((item) => item.relatedIds ?? []),
      ]),
    ];
    const targetParent = targetItems.find((item) => item.entryType === 'topic')?.id ?? null;
    for (const item of sourceItems) await recordNoteVersion(item);
    for (const item of sourceItems) {
      await updateThought(item.id, {
        topic: targetName,
        topicColor: targetColor,
        parentId: item.entryType === 'attachment' ? targetParent ?? item.parentId : item.parentId,
        relatedIds: relatedUnion,
        links: relatedUnion,
      });
    }
    setMergeOpen(false);
  }

  async function handleSynthesize() {
    if (!node) return;
    const mindNode = node as MindItem;
    const topic = mindNode.topic || node.title;
    const items = topicItemsFor(topic);
    setSynthesisLoading(true);
    setSynthesisError(null);
    setAiJob({ mode: 'synthesis', topic, count: Math.max(items.length, 1), done: false });
    try {
      const result = await synthesizeTopicWithAI({
        topic,
        items: items.length ? items : [{ title: node.title, distilledNote: mindNode.distilledNote, summary: mindNode.summary, extractedText: mindNode.extractedText }],
      });
      setSynthesisResult(result);
      finishAiJob(true);
    } catch (error) {
      setSynthesisError(error instanceof Error ? error.message : String(error));
      finishAiJob(false);
    } finally {
      setSynthesisLoading(false);
    }
  }

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
      className={`relative h-full w-full max-w-[420px] p-2 transition-transform duration-300 ease-out sm:p-3 ${
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
                    {loadClusterNames()[node.region] ?? REGION_META[node.region].label}
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] capitalize text-slate-400">
                    {node.type}
                  </span>
                  {node.moodScore !== null && <MoodBadge score={node.moodScore} />}
                </div>
                <h2 className="mt-2 text-lg font-semibold leading-snug text-white">
                  {node.title}
                </h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  {formatDate(node.createdAt)} ·{' '}
                  <span className="text-slate-400">
                    {touchedAt ? `touched ${relativeTime(touchedAt)}` : 'not opened yet'}
                  </span>
                </p>
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
              {(node as MindItem).distilledNote && (
                <p className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm leading-relaxed text-emerald-200">
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
                    Distilled note
                  </span>
                  {(node as MindItem).distilledNote}
                </p>
              )}

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
                        <AttachmentTile
                          attachment={attachment}
                          onView={(url, name) =>
                            setViewers((current) => [
                              ...current,
                              { id: `${attachment.id}-${Date.now()}`, url, name },
                            ])
                          }
                          onViewText={(attachment) =>
                            setTextWindows((current) => [
                              ...current,
                              { id: `${attachment.id}-${Date.now()}`, attachment },
                            ])
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="mt-4 rounded-xl border border-[#1f1f1f] bg-[#09090b] p-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Move to topic
                </h3>
                <div className="mt-2 flex flex-col gap-2">
                  <select
                    value={moveTopicSelection}
                    onChange={(event) => setMoveTopicSelection(event.target.value)}
                    className="rounded-lg border border-[#1f1f1f] bg-black px-2 py-1.5 text-xs text-zinc-300"
                  >
                    <option value="">Select topic…</option>
                    {topicOptions.map((topic) => (
                      <option key={topic.name} value={topic.name}>
                        {topic.name}
                      </option>
                    ))}
                    <option value="__new__">Create new topic…</option>
                  </select>
                  {moveTopicSelection === '__new__' && (
                    <input
                      value={newTopicName}
                      onChange={(event) => setNewTopicName(event.target.value)}
                      placeholder="New topic name"
                      className="rounded-lg border border-[#1f1f1f] bg-black px-2 py-1.5 text-xs text-zinc-300"
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleMoveTopic()}
                      disabled={!moveTopicSelection}
                      className="rounded-lg border border-[#1f1f1f] bg-black px-2.5 py-1 text-[11px] text-slate-300 transition hover:text-white disabled:opacity-50"
                    >
                      Move
                    </button>
                    <button
                      type="button"
                      onClick={() => setMergeOpen((value) => !value)}
                      className="rounded-lg border border-amber-500/30 bg-black px-2.5 py-1 text-[11px] text-amber-300 transition hover:border-amber-400/60"
                    >
                      Merge into Another Topic…
                    </button>
                  </div>
                  {mergeOpen && (
                    <div className="mt-1 flex flex-col gap-2 rounded-lg border border-[#1f1f1f] bg-black p-2">
                      <select
                        value={mergeTargetSelection}
                        onChange={(event) => setMergeTargetSelection(event.target.value)}
                        className="rounded-lg border border-[#1f1f1f] bg-[#09090b] px-2 py-1.5 text-xs text-zinc-300"
                      >
                        <option value="">Target topic…</option>
                        {topicOptions
                          .filter((topic) => topic.name !== ((node as MindItem).topic || 'Untagged'))
                          .map((topic) => (
                            <option key={topic.name} value={topic.name}>
                              {topic.name}
                            </option>
                          ))}
                        <option value="__new__">Create new topic…</option>
                      </select>
                      {mergeTargetSelection === '__new__' && (
                        <input
                          value={newMergeTopicName}
                          onChange={(event) => setNewMergeTopicName(event.target.value)}
                          placeholder="New target topic name"
                          className="rounded-lg border border-[#1f1f1f] bg-[#09090b] px-2 py-1.5 text-xs text-zinc-300"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => void handleMergeTopic()}
                        disabled={!mergeTargetSelection}
                        className="rounded-lg border border-amber-500/30 bg-[#09090b] px-2.5 py-1 text-[11px] text-amber-300 transition hover:border-amber-400/60 disabled:opacity-50"
                      >
                        Confirm merge
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <section className="mt-4 rounded-xl border border-[#1f1f1f] bg-[#09090b] p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Topic insights
                  </h3>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleScanGaps()}
                      disabled={gapLoading}
                      className="rounded-lg border border-[#1f1f1f] bg-black px-2.5 py-1 text-[11px] text-slate-300 transition hover:text-white disabled:opacity-50"
                    >
                      {gapLoading ? 'Scanning…' : 'Scan for Gaps'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSynthesize()}
                      disabled={synthesisLoading}
                      className="rounded-lg border border-[#1f1f1f] bg-black px-2.5 py-1 text-[11px] text-slate-300 transition hover:text-white disabled:opacity-50"
                    >
                      {synthesisLoading ? 'Synthesizing…' : 'Synthesize Topic'}
                    </button>
                  </div>
                </div>
                {gapError && <p className="mt-2 text-xs text-rose-300">{gapError}</p>}
                {synthesisError && <p className="mt-2 text-xs text-rose-300">{synthesisError}</p>}
                {synthesisResult && (
                  <div className="mt-3 space-y-3 rounded-lg border border-[#1f1f1f] bg-black p-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Master overview
                      </p>
                      <p className="mt-1 text-xs text-slate-300">{synthesisResult.master_overview}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Key takeaways
                      </p>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {synthesisResult.key_takeaways.length === 0 ? (
                          <li className="text-xs text-slate-500">None</li>
                        ) : (
                          synthesisResult.key_takeaways.map((item) => (
                            <li key={item} className="text-xs text-slate-300">• {item}</li>
                          ))
                        )}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Open questions
                      </p>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {synthesisResult.open_questions.length === 0 ? (
                          <li className="text-xs text-slate-500">None</li>
                        ) : (
                          synthesisResult.open_questions.map((item) => (
                            <li key={item} className="text-xs text-slate-300">• {item}</li>
                          ))
                        )}
                      </ul>
                    </div>
                  </div>
                )}
                {gapResult && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Missing concepts / thin areas
                      </p>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {gapResult.missing_concepts.length === 0 ? (
                          <li className="text-xs text-slate-500">None detected</li>
                        ) : (
                          gapResult.missing_concepts.map((concept) => (
                            <li key={concept} className="text-xs text-slate-300">
                              • {concept}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Suggested follow-up questions
                      </p>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {gapResult.follow_up_questions.length === 0 ? (
                          <li className="text-xs text-slate-500">None suggested</li>
                        ) : (
                          gapResult.follow_up_questions.map((question) => (
                            <li key={question} className="text-xs text-slate-300">
                              • {question}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </section>

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

            {showHistory && (
              <section className="border-t px-4 py-3" style={{ borderColor: 'var(--hud-border)' }}>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Version history
                </h3>
                {versions.length === 0 ? (
                  <p className="mt-1.5 text-xs text-slate-500">No previous versions yet.</p>
                ) : (
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {versions.map((version) => (
                      <li key={version.id} className="rounded-lg border border-[#1f1f1f] bg-black px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-xs text-slate-200">
                            {version.title}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleRevert(version)}
                            className="shrink-0 rounded-md border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-300 hover:border-amber-400/60"
                          >
                            Undo
                          </button>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {new Date(version.createdAt).toLocaleString()} · {version.topic ?? 'Untagged'}
                        </p>
                        {version.distilledNote && (
                          <p className="mt-1 text-[10px] text-slate-400">{version.distilledNote}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <div
              className="mt-auto flex items-center gap-2 border-t px-4 py-3"
              style={{ borderColor: 'var(--hud-border)' }}
            >
              <button
                type="button"
                onClick={() => setShowHistory((value) => !value)}
                className="rounded-lg border px-2.5 py-1.5 text-xs text-slate-300 transition hover:text-white"
                style={{ borderColor: 'var(--hud-border)' }}
              >
                History / Undo
              </button>
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

      {createPortal(
        <>
          {viewers.map((viewer) => (
            <ImageViewer
              key={viewer.id}
              url={viewer.url}
              name={viewer.name}
              onClose={() =>
                setViewers((current) => current.filter((item) => item.id !== viewer.id))
              }
            />
          ))}
          {textWindows.map((window) => (
            <TextViewer
              key={window.id}
              attachment={window.attachment}
              onClose={() =>
                setTextWindows((current) => current.filter((item) => item.id !== window.id))
              }
            />
          ))}
          {aiJob && (
            <AiProgressScreen
              mode={aiJob.mode}
              topic={aiJob.topic}
              itemCount={aiJob.count}
              done={aiJob.done}
            />
          )}
        </>,
        document.body,
      )}
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
                <span className="shrink-0 text-[10px] text-slate-500">{loadClusterNames()[node.region] ?? meta.label}</span>
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

function AttachmentTile({
  attachment,
  onView,
  onViewText,
}: {
  attachment: Attachment;
  onView?: (url: string, name: string) => void;
  onViewText?: (attachment: Attachment) => void;
}) {
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
      <button
        type="button"
        onClick={() => onView?.(url, attachment.name)}
        title={`${attachment.name} · ${formatBytes(attachment.size)}`}
        className="h-20 w-20 overflow-hidden rounded-lg ring-1 ring-white/10 transition hover:ring-indigo-400/60"
      >
        <img src={url} alt={attachment.name} className="h-full w-full object-cover" />
      </button>
    ) : (
      <div className="h-20 w-20 animate-pulse rounded-lg bg-white/5" />
    );
  }

  return (
    <div className="inline-flex max-w-[220px] items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-200">
      <span>📄</span>
      <span className="min-w-0 truncate">{attachment.name}</span>
      <span className="shrink-0 text-[10px] text-slate-500">{formatBytes(attachment.size)}</span>
      {onViewText && (
        <button
          type="button"
          onClick={() => onViewText(attachment)}
          className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
        >
          View
        </button>
      )}
      {/^https?:\/\//i.test(attachment.name.trim()) && (
        <a
          href={attachment.name.trim()}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
        >
          Open
        </a>
      )}
      {url && (
        <a
          href={url}
          download={attachment.name}
          className="shrink-0 text-[10px] text-slate-400 hover:text-white"
        >
          ↓
        </a>
      )}
    </div>
  );
}
