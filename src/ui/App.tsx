import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listThoughts, createThought, addAttachment } from '../core/repository';
import { db } from '../core/db';
import type { ThoughtNode } from '../core/types';
import { loadVisits, recordVisit } from './visits';
import { SearchPanel } from './components/SearchPanel';
import { NodeInspector } from './components/NodeInspector';
import { CapturePage } from './components/CapturePage';
import { AuthPanel } from './components/AuthPanel';
import { loadUserGalaxy, saveUserGalaxy } from '../lib/supabaseSync';
import { useClusterNames } from './hooks/useClusterNames';
import { loadClusterNames } from '../lib/clusterNames';
import { organizeWithAI, searchWithAI } from '../lib/ai';
import { rankThoughts, type RankedThought } from './relevance';
import { uploadFile, fileToBase64, compressImageForUpload } from '../lib/supabaseStorage';
import { recordNoteVersion } from '../lib/noteVersions';
import { TopicGraph } from '../worlds/TopicGraph';
import { asItems, type MindItem } from './types';
import type { Region } from '../core/types';

export default function App() {
  const thoughts = useLiveQuery(() => listThoughts(), []);
  const items = useMemo(() => asItems(thoughts ?? []), [thoughts]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorMinimized, setInspectorMinimized] = useState(false);
  const [inspectorMaximized, setInspectorMaximized] = useState(false);
  const [inspectorPos, setInspectorPos] = useState({ x: 80, y: 80 });
  const [captureOpen, setCaptureOpen] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);

  function handleInspectorDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (inspectorMaximized) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    dragOffsetRef.current = {
      x: event.clientX - inspectorPos.x,
      y: event.clientY - inspectorPos.y,
    };
  }

  function handleInspectorDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const width = inspectorMinimized ? 260 : Math.min(420, window.innerWidth * 0.9);
    const height = inspectorMinimized ? 44 : window.innerHeight * 0.7;
    const x = Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - dragOffsetRef.current.x));
    const y = Math.max(8, Math.min(window.innerHeight - height - 8, event.clientY - dragOffsetRef.current.y));
    setInspectorPos({ x, y });
  }

  function handleInspectorDragEnd(event: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }
  const [query, setQuery] = useState('');
  const [commandOpen, setCommandOpen] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importText, setImportText] = useState('');
  const [importEntryType, setImportEntryType] = useState<'topic' | 'attachment'>('topic');
  const [importParentId, setImportParentId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiRankedIds, setAiRankedIds] = useState<string[]>([]);
  const [aiReasons, setAiReasons] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const aiRequestRef = useRef(0);
  const [importStage, setImportStage] = useState<string | null>(null);
  const importRunIdRef = useRef(0);
  const importTimersRef = useRef<number[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [syncLoaded, setSyncLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [clusterNames, , setClusterNames] = useClusterNames();
  const [tilt, setTilt] = useState(0);
  const [visits, setVisits] = useState<Record<string, string>>(() => loadVisits());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const handleUserChange = useCallback(async (id: string | null) => {
    setUserId(id);
    setSyncLoaded(false);
    if (!id) return;
    try {
      const state = await loadUserGalaxy(id);
      if (state?.nodes) {
        await db.thoughts.clear();
        if (state.nodes.length) await db.thoughts.bulkAdd(state.nodes as ThoughtNode[]);
      }
      if (state?.clusterNames) {
        const merged = { ...loadClusterNames(), ...state.clusterNames } as Record<Region, string>;
        setClusterNames(merged);
      }
      if (typeof state?.tilt === 'number') setTilt(state.tilt);
      setSyncStatus('Loaded cloud galaxy');
    } catch (error) {
      console.error('Failed to load galaxy:', error);
      setSyncStatus(`Load failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSyncLoaded(true);
    }
  }, [setClusterNames]);

  useEffect(() => {
    if (!userId || !syncLoaded) return;
    const timer = window.setTimeout(() => {
      void saveUserGalaxy(userId, {
        nodes: items as unknown as ThoughtNode[],
        clusterNames,
        tilt,
      })
        .then(() => setSyncStatus('Saved to cloud'))
        .catch((error) => {
          console.error('Failed to save galaxy:', error);
          setSyncStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [userId, syncLoaded, items, clusterNames, tilt]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    function onDragOver(event: DragEvent) {
      event.preventDefault();
      setDragActive(true);
    }
    function onDragLeave(event: DragEvent) {
      if (!event.relatedTarget) setDragActive(false);
    }
    function onDrop(event: DragEvent) {
      event.preventDefault();
      setDragActive(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) setImportFiles((prev) => [...prev, ...files]);
      const text = event.dataTransfer?.getData('text/plain');
      if (text) setImportText((prev) => (prev ? `${prev}\n${text}` : text));
    }
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const topics = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string; count: number }>();
    for (const item of items) {
      const name = item.topic || 'Untagged';
      const color = item.topicColor || '#94a3b8';
      if (!map.has(name)) map.set(name, { id: name, name, color, count: 0 });
      map.get(name)!.count += 1;
    }
    return [...map.values()];
  }, [items]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const regionCounts = useMemo(() => {
    const counts = { prefrontal: 0, hippocampus: 0, limbic: 0, parietal: 0 } as Record<Region, number>;
    for (const item of items) {
      if (item.region in counts) counts[item.region as Region] += 1;
    }
    return counts;
  }, [items]);

  const rankedThoughts = useMemo<RankedThought[]>(() => rankThoughts(items as unknown as ThoughtNode[], { query, region: 'all' }), [items, query]);

  const aiRankedThoughts = useMemo(() => {
    if (aiRankedIds.length === 0) return rankedThoughts;
    const byId = new Map(rankedThoughts.map((entry) => [entry.node.id, entry]));
    const ranked = aiRankedIds.map((id) => byId.get(id)).filter(Boolean) as RankedThought[];
    const rest = rankedThoughts.filter((entry) => !aiRankedIds.includes(entry.node.id));
    return [...ranked, ...rest];
  }, [aiRankedIds, rankedThoughts]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setAiRankedIds([]);
      setAiAnswer('');
      setAiReasons({});
      setAiLoading(false);
      return;
    }
    const requestId = ++aiRequestRef.current;
    setAiLoading(true);
    const timer = window.setTimeout(() => {
      void searchWithAI({
        query,
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          topic: item.topic,
          summary: item.summary,
          extractedText: item.extractedText,
        })),
      })
        .then((result) => {
          if (requestId !== aiRequestRef.current) return;
          setAiRankedIds(result.ranked_ids ?? []);
          setAiAnswer(result.answer ?? '');
          const reasonMap: Record<string, string> = {};
          for (const entry of result.reasons ?? []) {
            if (entry?.id) reasonMap[entry.id] = entry.why;
          }
          setAiReasons(reasonMap);
        })
        .catch((error) => {
          if (requestId !== aiRequestRef.current) return;
          console.error('AI search failed:', error);
          setAiRankedIds([]);
          setAiAnswer('');
          setAiReasons({});
        })
        .finally(() => {
          if (requestId !== aiRequestRef.current) return;
          setAiLoading(false);
        });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [query, items]);

  async function processSingleImport(
    file: File | null,
    text: string,
    queueLabel: string,
    runId: number,
  ) {
    const files = file ? [file] : [];
    setImportStage(`${queueLabel}Reading file & preparing payload...`);
    try {
      const fileData = await Promise.all(
        files.map(async (currentFile) => {
          const isText = currentFile.type.startsWith('text/') || /\.(md|txt)$/i.test(currentFile.name);
          const prepared = await compressImageForUpload(currentFile);
          return {
            name: currentFile.name,
            mimeType: prepared.type || currentFile.type || 'application/octet-stream',
            size: prepared.size,
            text: isText ? await currentFile.text() : undefined,
            base64: isText ? undefined : await fileToBase64(prepared),
          };
        }),
      );

      const uploads = await Promise.all(files.map((currentFile) => uploadFile(currentFile, userId)));

      if (importRunIdRef.current !== runId) return;
      setImportStage(`${queueLabel}Analyzing content & extracting concepts...`);
      const matchingTimer = window.setTimeout(() => {
        if (importRunIdRef.current === runId) {
          setImportStage(`${queueLabel}Matching against your Topics & building links...`);
        }
      }, 3500);
      const distillTimer = window.setTimeout(() => {
        if (importRunIdRef.current === runId) {
          setImportStage(`${queueLabel}Distilling core takeaway note...`);
        }
      }, 8000);
      importTimersRef.current.push(matchingTimer, distillTimer);

      const result = await organizeWithAI({
        text,
        files: fileData,
        topics: topics.map((topic) => ({ id: topic.id, name: topic.name, color: topic.color })),
      });

      importTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      importTimersRef.current = [];

      if (importRunIdRef.current !== runId) return;
      setImportStage(`${queueLabel}Syncing to your MindSpace...`);

      let parentId: string | null = null;
      if (importEntryType === 'attachment') {
        parentId =
          importParentId ||
          items.find((item) => item.topic === result.topic && item.entryType === 'topic')?.id ||
          null;
      }

      const node = await createThought({
        title: result.title,
        content: result.summary,
        type: 'note',
        region: 'hippocampus',
        tags: [result.topic, ...result.related_ids],
        moodScore: null,
        attachments: [],
      });

      for (const currentFile of files) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await addAttachment(node.id, currentFile);
        } catch (error) {
          console.warn('Local attachment store failed:', error);
        }
      }

      const enriched = {
        ...node,
        title: result.title,
        content: text.trim() || result.summary,
        topic: result.topic,
        topicColor: result.topic_color,
        summary: result.summary,
        distilledNote: result.distilled_note,
        extractedText: result.extracted_text,
        entryType: importEntryType,
        parentId,
        relatedIds: result.related_ids ?? [],
        links: result.related_ids ?? [],
        storagePath: uploads[0]?.path ?? null,
      } as unknown as ThoughtNode;
      await db.thoughts.put(enriched);
      await recordNoteVersion(enriched as unknown as MindItem);

      if (importRunIdRef.current !== runId) return;
      setImportStage(`${queueLabel}Organized into ${result.topic}`);
      await new Promise((resolve) => window.setTimeout(resolve, 900));

      setSelectedId(node.id);
    } catch (error) {
      console.error('Import failed:', error);
      setSyncStatus(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function runImport() {
    if (importFiles.length === 0 && !importText.trim()) return;
    const runId = ++importRunIdRef.current;
    importTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    importTimersRef.current = [];

    const jobs: Array<{ file: File | null; text: string }> = [];
    if (importFiles.length > 0) {
      for (const file of importFiles) jobs.push({ file, text: '' });
    }
    if (importText.trim()) jobs.push({ file: null, text: importText });
    const total = jobs.length;

    try {
      for (let index = 0; index < jobs.length; index += 1) {
        if (importRunIdRef.current !== runId) return;
        const job = jobs[index];
        const queueLabel = total > 1 ? `Processing file ${index + 1} of ${total} — ` : '';
        // eslint-disable-next-line no-await-in-loop
        await processSingleImport(job.file, job.text, queueLabel, runId);
      }
      if (importRunIdRef.current !== runId) return;
      setImportFiles([]);
      setImportText('');
      setImportParentId(null);
    } catch (error) {
      console.error('Import failed:', error);
      setSyncStatus(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      importTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      importTimersRef.current = [];
      if (importRunIdRef.current === runId) {
        setImportStage(null);
      }
    }
  }

  const hasPendingImport = importFiles.length > 0 || importText.trim().length > 0;

  void commandOpen;
  void setCommandOpen;
  void setImportEntryType;
  void dragActive;
  void setDragActive;
  void importStage;
  void setImportStage;
  void visits;
  void setVisits;
  void fileInputRef;
  void searchInputRef;
  void selected;
  void setSelectedId;
  void runImport;
  void hasPendingImport;
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#000000] text-zinc-100">
      <div className="absolute inset-x-0 top-0 z-30 flex flex-wrap items-center gap-2 bg-transparent px-3 py-2">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <SearchPanel
            query={query}
            onQueryChange={setQuery}
            region="all"
            onRegionChange={() => {}}
            ranked={aiRankedThoughts}
            counts={regionCounts}
            total={items.length}
            onPick={(node) => {
              setSelectedId(node.id);
              setVisits(recordVisit(node.id));
            }}
            clusterNames={clusterNames}
            loading={aiLoading}
            aiAnswer={aiAnswer}
            aiReasons={aiReasons}
          />
        </div>
        <div className="shrink-0">
          <AuthPanel onUserChange={handleUserChange} status={syncStatus} />
        </div>
      </div>
      <section className="absolute inset-0 bg-black pt-16">
        <TopicGraph items={items} selectedId={selectedId} onSelect={setSelectedId} />
      </section>

      {selected && (
        <div
          className="fixed z-40 overflow-hidden rounded-2xl border border-[#1f1f1f] bg-[#09090b]/95 shadow-2xl"
          style={
            inspectorMaximized
              ? { inset: 0, width: '100%', height: '100%' }
              : inspectorMinimized
                ? { left: inspectorPos.x, top: inspectorPos.y, width: 260, height: 44 }
                : { left: inspectorPos.x, top: inspectorPos.y, width: 'min(420px, 90vw)', height: '70vh' }
          }
        >
          <div
            className="flex cursor-move select-none items-center justify-between border-b border-[#1f1f1f] bg-black/60 px-3 py-2"
            style={{ touchAction: 'none' }}
            onPointerDown={handleInspectorDragStart}
            onPointerMove={handleInspectorDragMove}
            onPointerUp={handleInspectorDragEnd}
            onPointerCancel={handleInspectorDragEnd}
          >
            <span className="pointer-events-none text-xs font-medium text-zinc-300">{selected.title}</span>
            <div
              className="flex items-center gap-1"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button type="button" onClick={() => setInspectorMinimized((v) => !v)} className="rounded px-2 text-xs text-zinc-400 hover:text-white">
                {inspectorMinimized ? '□' : '_'}
              </button>
              <button type="button" onClick={() => { setInspectorMaximized((v) => !v); setInspectorMinimized(false); }} className="rounded px-2 text-xs text-zinc-400 hover:text-white">
                {inspectorMaximized ? '❐' : '▢'}
              </button>
              <button type="button" onClick={() => setSelectedId(null)} className="rounded px-2 text-xs text-zinc-400 hover:text-white">
                ×
              </button>
            </div>
          </div>
          {!inspectorMinimized && (
            <div className="h-[calc(100%-40px)] overflow-y-auto">
              <NodeInspector
                node={selected as unknown as any}
                thoughts={items as unknown as any}
                touchedAt={selectedId ? visits[selectedId] ?? null : null}
                onClose={() => setSelectedId(null)}
                onFocus={(id) => {
                  setSelectedId(id);
                  setVisits(recordVisit(id));
                }}
              />
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setCaptureOpen(true)}
        className="fixed bottom-4 left-4 z-40 rounded-full border border-[#1f1f1f] bg-[#09090b]/90 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur hover:bg-white/10"
      >
        + Capture
      </button>

      {captureOpen && (
        <CapturePage
          onClose={() => setCaptureOpen(false)}
          onSaved={(node) => {
            setSelectedId(node.id);
            setVisits(recordVisit(node.id));
            setCaptureOpen(false);
          }}
        />
      )}
    </main>
  );
}
