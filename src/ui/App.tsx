import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addAttachment, listThoughts } from '../core/repository';
import { db } from '../core/db';
import type { Region, ThoughtNode } from '../core/types';
import { SearchPanel } from './components/SearchPanel';
import { CapturePage } from './components/CapturePage';
import { AuthPanel } from './components/AuthPanel';
import { SolarPanel } from './components/SolarPanel';
import { DocumentWindow } from './components/DocumentWindow';
import { AiChat } from './components/AiChat';
import { ImportPanel } from './components/ImportPanel';
import { loadUserGalaxy, saveUserGalaxy } from '../lib/supabaseSync';
import { useClusterNames } from './hooks/useClusterNames';
import { loadClusterNames } from '../lib/clusterNames';
import { searchWithAI, organizeBatchWithAI, type BatchOrganizeFile } from '../lib/ai';
import { rankThoughts, type RankedThought } from './relevance';
import { uploadFile } from '../lib/supabaseStorage';
import { extractDocuments } from '../lib/extractText';
import {
  buildSolarSystem,
  entryKind,
  findPlanet,
  findStar,
  locateMoon,
  planetKey,
  starNameOf,
  type SolarPlanet,
  type SolarStar,
} from '../lib/solar';
import { applyOrganizePlan, createMoon, ensurePlanet, ensureStar } from '../lib/organize';
import { TopicGraph, type SolarFocusRequest } from '../worlds/TopicGraph';
import { asItems, type MindItem } from './types';

type Reveal =
  | { kind: 'star'; star: string }
  | { kind: 'planet'; star: string; planet: string }
  | { kind: 'moon'; star: string; planet: string; moonId: string };

export default function App() {
  const thoughts = useLiveQuery(() => listThoughts(), []);
  const items = useMemo(() => asItems(thoughts ?? []), [thoughts]);
  const stars = useMemo(() => buildSolarSystem(items), [items]);

  const [query, setQuery] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiRankedIds, setAiRankedIds] = useState<string[]>([]);
  const [aiReasons, setAiReasons] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const aiRequestRef = useRef(0);

  const [activeStar, setActiveStar] = useState<string | null>(null);
  const [expandedPlanet, setExpandedPlanet] = useState<string | null>(null);
  const [selectedPlanetKey, setSelectedPlanetKey] = useState<string | null>(null);
  const [activeMoonId, setActiveMoonId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<SolarFocusRequest | null>(null);
  const pendingRevealRef = useRef<Reveal | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const focusTokenRef = useRef(0);

  const [captureOpen, setCaptureOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importText, setImportText] = useState('');
  const [importStage, setImportStage] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importRunRef = useRef(0);

  const [userId, setUserId] = useState<string | null>(null);
  const [syncLoaded, setSyncLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [clusterNames, , setClusterNames] = useClusterNames();

  /* ------------------------------------------------------------ reveal */

  const applyReveal = useCallback((reveal: Reveal | null) => {
    if (!reveal) return;
    pendingRevealRef.current = null;
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setActiveStar(reveal.star);
    if (reveal.kind === 'star') {
      setExpandedPlanet(null);
      setSelectedPlanetKey(null);
      return;
    }
    setSelectedPlanetKey(planetKey(reveal.star, reveal.planet));
    setExpandedPlanet(reveal.planet);
    if (reveal.kind === 'moon') setActiveMoonId(reveal.moonId);
  }, []);

  /**
   * Fly first, open later. The reveal (window/panel) is stored and applied when
   * the camera reports arrival (or by a fallback timer if it never does), so no
   * window pops over the screen while the camera is still travelling.
   */
  const requestFocus = useCallback(
    (request: Omit<SolarFocusRequest, 'token'>, reveal: Reveal | null) => {
      focusTokenRef.current += 1;
      setFocusRequest({ ...request, token: focusTokenRef.current });
      pendingRevealRef.current = reveal;
      if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = reveal
        ? window.setTimeout(() => applyReveal(pendingRevealRef.current), 6000)
        : null;
    },
    [applyReveal],
  );

  const handleArrive = useCallback(() => {
    applyReveal(pendingRevealRef.current);
  }, [applyReveal]);

  useEffect(
    () => () => {
      if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
    },
    [],
  );

  const openMoon = useCallback(
    (moon: MindItem) => {
      const location = locateMoon(stars, moon.id);
      if (!location) {
        setActiveMoonId(moon.id);
        return;
      }
      setActiveStar(location.star);
      setSelectedPlanetKey(planetKey(location.star, location.planet));
      setExpandedPlanet(location.planet);
      setActiveMoonId(location.moonId);
      requestFocus({ kind: 'moon', star: location.star, itemId: location.moonId }, null);
    },
    [requestFocus, stars],
  );

  const handlePick = useCallback(
    (node: ThoughtNode) => {
      const item = node as MindItem;
      const kind = entryKind(item);
      if (kind === 'planet') {
        const star = starNameOf(item);
        requestFocus(
          { kind: 'planet', star, planet: item.title },
          { kind: 'planet', star, planet: item.title },
        );
        return;
      }
      if (kind === 'moon') {
        const location = locateMoon(stars, item.id);
        if (location) {
          requestFocus(
            { kind: 'moon', star: location.star, itemId: item.id },
            { kind: 'moon', ...location },
          );
        } else {
          setActiveMoonId(item.id);
          requestFocus({ kind: 'moon', star: starNameOf(item), itemId: item.id }, null);
        }
        return;
      }
      const star = starNameOf(item);
      requestFocus({ kind: 'star', star }, { kind: 'star', star });
    },
    [requestFocus, stars],
  );

  const handleSelectStar = useCallback(
    (name: string) => {
      requestFocus({ kind: 'star', star: name }, { kind: 'star', star: name });
    },
    [requestFocus],
  );

  const handleSelectPlanet = useCallback(
    (star: string, planet: string) => {
      requestFocus(
        { kind: 'planet', star, planet },
        { kind: 'planet', star, planet },
      );
    },
    [requestFocus],
  );

  const handleSelectMoon = useCallback(
    (id: string) => {
      const moon = items.find((item) => item.id === id);
      if (moon) openMoon(moon);
    },
    [items, openMoon],
  );

  const handleFocusMoonId = useCallback(
    (id: string) => {
      const moon = items.find((item) => item.id === id);
      if (moon) openMoon(moon);
    },
    [items, openMoon],
  );

  const handleOrganize = useCallback(
    async (plan: {
      starName?: string;
      starColor?: string;
      planets: Array<{ name: string; moonIds: string[] }>;
    }): Promise<string> => {
      try {
        const applied = await applyOrganizePlan(
          {
            starName: plan.starName,
            starColor: plan.starColor,
            planets: plan.planets.map((planet) => ({
              name: planet.name,
              moonIds: planet.moonIds,
            })),
          },
          stars,
        );
        setActiveStar(applied.star);
        const list = applied.planets.join(', ');
        return applied.moved > 0
          ? `Organized ${applied.moved} moon${applied.moved === 1 ? '' : 's'} into ${list} under ${applied.star}.`
          : `Created ${list} under ${applied.star}; no moon needed moving.`;
      } catch (error) {
        return `Could not apply that organization: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
    [stars],
  );

  /* -------------------------------------------------------- cloud sync */

  const handleUserChange = useCallback(
    async (id: string | null) => {
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
        setSyncStatus('Loaded cloud galaxy');
      } catch (error) {
        console.error('Failed to load galaxy:', error);
        setSyncStatus(`Load failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setSyncLoaded(true);
      }
    },
    [setClusterNames],
  );

  useEffect(() => {
    if (!userId || !syncLoaded) return;
    const timer = window.setTimeout(() => {
      void saveUserGalaxy(userId, {
        nodes: items as unknown as ThoughtNode[],
        clusterNames,
        tilt: 0,
      })
        .then(() => setSyncStatus('Saved to cloud'))
        .catch((error) => {
          console.error('Failed to save galaxy:', error);
          setSyncStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [userId, syncLoaded, items, clusterNames]);

  /* ------------------------------------------------------------ search */

  const rankedThoughts = useMemo<RankedThought[]>(
    () => rankThoughts(items as unknown as ThoughtNode[], { query, region: 'all' }),
    [items, query],
  );

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
        // Cap both the number of nodes and the text per node: extracted
        // document text is now large, and the whole index must stay inside the
        // serverless request-body limit.
        items: items.slice(0, 160).map((item) => ({
          id: item.id,
          title: item.title,
          topic: item.topic,
          summary: item.summary,
          extractedText: item.extractedText?.slice(0, 1200),
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

  /* ------------------------------------------------------------ import */

  const runImport = useCallback(async () => {
    if (importBusy) return;
    const files = [...importFiles];
    const text = importText.trim();
    if (files.length === 0 && !text) return;

    const runId = importRunRef.current + 1;
    importRunRef.current = runId;
    const timers: number[] = [];
    setImportBusy(true);
    setImportError(null);
    setImportStage('Reading document text locally…');

    try {
      const extracted = await extractDocuments(files);
      if (importRunRef.current !== runId) return;

      const entries: BatchOrganizeFile[] = extracted.map((doc, index) => ({
        index,
        name: doc.name,
        mimeType: doc.mimeType,
        size: doc.size,
        kind: doc.kind,
        status: doc.status,
        note: doc.note,
        truncated: doc.truncated,
        text: doc.text || undefined,
        imageBase64: doc.imageBase64,
        imageMimeType: doc.imageMimeType,
      }));
      if (text) {
        entries.push({
          index: entries.length,
          name: 'Typed note',
          mimeType: 'text/plain',
          size: text.length,
          kind: 'text',
          status: 'ok',
          text,
        });
      }

      setImportStage(`Placing ${entries.length} moon${entries.length === 1 ? '' : 's'} with the AI…`);
      timers.push(
        window.setTimeout(() => {
          if (importRunRef.current === runId) setImportStage('Grouping files into planets (units)…');
        }, 3500),
      );
      timers.push(
        window.setTimeout(() => {
          if (importRunRef.current === runId) setImportStage('Naming the star (topic) and linking moons…');
        }, 8000),
      );

      const result = await organizeBatchWithAI({
        files: entries,
        stars: stars.map((star) => ({
          id: star.id ?? star.name,
          name: star.name,
          color: star.color,
        })),
        units: stars.flatMap((star) =>
          star.planets.map((planet) => ({ star: star.name, name: planet.name })),
        ),
      });
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.length = 0;
      if (importRunRef.current !== runId) return;

      setImportStage('Creating star, planets and moons…');

      const starName = (result.star?.name || result.planets?.[0]?.name || 'Unsorted').trim();
      const starColor =
        (result.star?.color || '').trim() ||
        stars.find((star) => star.name === starName)?.color ||
        '#c6d6e8';
      const existingStar = stars.find((star) => star.name === starName) ?? null;
      const starNode = await ensureStar({ name: starName, color: starColor, existing: existingStar });
      const starShape = { name: starName, color: starColor, id: starNode.id };

      const planetNodes = new Map<string, MindItem>();
      for (const planetResult of result.planets ?? []) {
        const name = planetResult.name?.trim();
        if (!name) continue;
        const existingPlanet = existingStar?.planets.find((planet) => planet.name === name) ?? null;
        // eslint-disable-next-line no-await-in-loop
        const node = await ensurePlanet({
          star: starShape,
          name,
          color: starColor,
          existing: existingPlanet,
        });
        planetNodes.set(name, node);
      }

      const uploads = await Promise.all(
        files.map((file) =>
          uploadFile(file, userId).catch(() => ({ path: null, publicUrl: null, base64: null })),
        ),
      );
      const moonByIndex = new Map((result.moons ?? []).map((moon) => [moon.index, moon]));
      const fallbackPlanet = result.planets?.[0]?.name?.trim() || 'General';
      let firstPlanet: string | null = null;

      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const doc = extracted[index];
        const moonResult = moonByIndex.get(index);
        const aiText = moonResult?.extracted_text?.trim() ?? '';
        const localText = doc?.text ?? entry.text ?? '';
        const extractedText = aiText || localText;
        const localStatus = doc?.status ?? 'ok';
        const extractionStatus = extractedText ? 'ok' : localStatus;
        const planetName = moonResult?.planet?.trim() || fallbackPlanet;
        let planetNode = planetNodes.get(planetName);
        if (!planetNode) {
          // eslint-disable-next-line no-await-in-loop
          planetNode = await ensurePlanet({
            star: starShape,
            name: planetName,
            color: starColor,
            existing: null,
          });
          planetNodes.set(planetName, planetNode);
        }
        if (!firstPlanet) firstPlanet = planetName;

        const title =
          moonResult?.title?.trim() ||
          entry.name.replace(/\.[^.]+$/, '') ||
          'Untitled document';

        // eslint-disable-next-line no-await-in-loop
        const moon = await createMoon({
          title,
          star: starName,
          starColor,
          planet: planetNode,
          unit: planetName,
          content: moonResult?.summary || extractedText.slice(0, 500),
          summary: moonResult?.summary ?? '',
          distilledNote: moonResult?.distilled_note ?? '',
          extractedText,
          relatedIds: result.related_ids ?? [],
          storagePath: uploads[index]?.path ?? null,
          extractionStatus,
          extractionNote:
            doc?.kind === 'image' && aiText
              ? 'Image contents read by AI vision.'
              : doc?.note,
          textChars: extractedText.length,
        });

        if (index < files.length) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await addAttachment(moon.id, files[index]);
          } catch (error) {
            console.warn('Local attachment store failed:', error);
          }
        }
      }

      if (importRunRef.current !== runId) return;
      setImportFiles([]);
      setImportText('');
      setImportOpen(false);
      setImportStage(null);
      setActiveStar(starName);
      if (firstPlanet) {
        setSelectedPlanetKey(planetKey(starName, firstPlanet));
        setExpandedPlanet(firstPlanet);
        requestFocus(
          { kind: 'planet', star: starName, planet: firstPlanet },
          { kind: 'planet', star: starName, planet: firstPlanet },
        );
      } else {
        requestFocus({ kind: 'star', star: starName }, { kind: 'star', star: starName });
      }
      setSyncStatus(
        `Imported ${entries.length} item${entries.length === 1 ? '' : 's'} into ${starName}`,
      );
    } catch (error) {
      console.error('Import failed:', error);
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      timers.forEach((timer) => window.clearTimeout(timer));
      if (importRunRef.current === runId) {
        setImportBusy(false);
        setImportStage(null);
      }
    }
  }, [
    importBusy,
    importFiles,
    importText,
    requestFocus,
    stars,
    userId,
  ]);

  /* ------------------------------------------------------------- misc */

  useEffect(() => {
    function onDragOver(event: DragEvent) {
      event.preventDefault();
    }
    function onDrop(event: DragEvent) {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        setImportFiles((previous) => [...previous, ...files]);
        setImportOpen(true);
      }
    }
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (importOpen) setImportOpen(false);
        else if (activeMoonId) setActiveMoonId(null);
        else if (activeStar) setActiveStar(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeMoonId, activeStar, importOpen]);

  const regionCounts = useMemo(() => {
    const counts = { prefrontal: 0, hippocampus: 0, limbic: 0, parietal: 0 } as Record<Region, number>;
    for (const item of items) {
      if (item.region in counts) counts[item.region as Region] += 1;
    }
    return counts;
  }, [items]);

  const solarStar: SolarStar | null = findStar(stars, activeStar);
  const activeMoon = useMemo(
    () => items.find((item) => item.id === activeMoonId) ?? null,
    [items, activeMoonId],
  );
  const activeMoonLocation = activeMoon ? locateMoon(stars, activeMoon.id) : null;
  const activeMoonStar = activeMoonLocation ? findStar(stars, activeMoonLocation.star) : null;
  const activeMoonPlanet: SolarPlanet | null = activeMoonLocation
    ? findPlanet(stars, activeMoonLocation.star, activeMoonLocation.planet)
    : null;

  /** Fly back to the galaxy-wide home view and clear what was open. */
  function recenter() {
    setActiveMoonId(null);
    setActiveStar(null);
    setSelectedPlanetKey(null);
    setExpandedPlanet(null);
    requestFocus({ kind: 'home' }, null);
  }

  function togglePlanet(planet: SolarPlanet) {
    const next = expandedPlanet === planet.name ? null : planet.name;
    setExpandedPlanet(next);
    setSelectedPlanetKey(next ? planet.key : null);
    if (next) {
      requestFocus({ kind: 'planet', star: planet.star, planet: planet.name }, null);
    }
  }

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
            onPick={handlePick}
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

      <section className="absolute inset-0 z-0 bg-black pt-16">
        <TopicGraph
          items={items}
          focusRequest={focusRequest}
          onArrive={handleArrive}
          selectedMoonId={activeMoonId}
          selectedPlanetKey={selectedPlanetKey}
          onSelectStar={handleSelectStar}
          onSelectPlanet={handleSelectPlanet}
          onSelectMoon={handleSelectMoon}
        />
      </section>

      {solarStar && (
        <SolarPanel
          star={solarStar}
          expandedPlanet={expandedPlanet}
          onTogglePlanet={togglePlanet}
          onOpenMoon={openMoon}
          onClose={() => {
            setActiveStar(null);
            setSelectedPlanetKey(null);
          }}
        />
      )}

      {activeMoon && (
        <DocumentWindow
          moon={activeMoon}
          star={activeMoonStar}
          planet={activeMoonPlanet}
          onClose={() => setActiveMoonId(null)}
        />
      )}

      <AiChat
        stars={stars}
        activeMoon={activeMoon}
        onFocusMoon={handleFocusMoonId}
        onOrganize={handleOrganize}
      />

      <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCaptureOpen(true)}
          className="rounded-full border border-[#1f1f1f] bg-[#09090b]/90 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur hover:bg-white/10"
        >
          + Capture
        </button>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="rounded-full border border-[#1f1f1f] bg-[#09090b]/90 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur hover:bg-white/10"
        >
          ⇪ Import
        </button>
        <button
          type="button"
          onClick={recenter}
          title="Back to the galaxy-wide view"
          className="rounded-full border border-[#1f1f1f] bg-[#09090b]/90 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur hover:bg-white/10"
        >
          ⌖ Recenter
        </button>
      </div>

      {captureOpen && (
        <CapturePage
          onClose={() => setCaptureOpen(false)}
          onSaved={(node) => {
            setCaptureOpen(false);
            const moon = node as MindItem;
            openMoon(moon);
          }}
        />
      )}

      {importOpen && (
        <ImportPanel
          files={importFiles}
          text={importText}
          stage={importStage}
          busy={importBusy}
          error={importError}
          onFilesChange={setImportFiles}
          onTextChange={setImportText}
          onSubmit={() => void runImport()}
          onClose={() => {
            if (importBusy) return;
            setImportOpen(false);
          }}
        />
      )}
    </main>
  );
}
