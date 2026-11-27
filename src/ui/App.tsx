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
import { ViewSwitcher, type WorkspaceView } from './components/ViewSwitcher';
import { FileSystemView, type FileSystemPath } from './components/FileSystemView';
import { ItemContextMenu, type ItemContextAction } from './components/ItemContextMenu';
import { AiMoveDialog, DeleteConfirmDialog, MoveItemDialog } from './components/ItemActionDialogs';
import { useItemContextMenu } from './hooks/useItemContextMenu';
import { describeTarget } from './targets';
import { loadUserGalaxy, saveUserGalaxy } from '../lib/supabaseSync';
import { useClusterNames } from './hooks/useClusterNames';
import { loadClusterNames } from '../lib/clusterNames';
import { searchWithAI, chatWithAI, organizeBatchWithAI, type BatchOrganizeFile } from '../lib/ai';
import { rankThoughts, type RankedThought } from './relevance';
import { uploadFile } from '../lib/supabaseStorage';
import { extractDocuments } from '../lib/extractText';
import {
  buildChatIndex,
  buildSolarSystem,
  entryKind,
  findPlanet,
  findStar,
  locateMoon,
  planetKey,
  starNameOf,
  targetFromMoon,
  targetFromPlanet,
  type SolarPlanet,
  type SolarStar,
  type SolarTarget,
} from '../lib/solar';
import {
  applyOrganizePlan,
  createMoon,
  deleteSolarTarget,
  ensurePlanet,
  ensureStar,
  moveSolarTarget,
} from '../lib/organize';
import { TopicGraph, type SolarFocusRequest } from '../worlds/TopicGraph';
import { asItems, type AiBinding, type MindItem } from './types';

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

  const [view, setView] = useState<WorkspaceView>(() =>
    typeof window !== 'undefined' && window.localStorage.getItem('mindspace:view') === 'files'
      ? 'files'
      : 'galaxy',
  );
  const [filePath, setFilePath] = useState<FileSystemPath>({ star: null, planet: null });
  const {
    menu: contextMenuState,
    bind: bindItemContext,
    close: closeContextMenu,
    open: openContextMenu,
  } = useItemContextMenu();
  const [moveTarget, setMoveTarget] = useState<SolarTarget | null>(null);
  const [aiMoveTarget, setAiMoveTarget] = useState<SolarTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SolarTarget | null>(null);
  const [aiBinding, setAiBinding] = useState<AiBinding | null>(null);
  const aiBindingTokenRef = useRef(0);

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

  useEffect(() => {
    try {
      window.localStorage.setItem('mindspace:view', view);
    } catch {
      // Storage can be unavailable in private mode; the view still works in-session.
    }
  }, [view]);

  useEffect(() => {
    closeContextMenu();
  }, [view, closeContextMenu]);

  // Keep the file-system path valid after a delete or a cloud re-sync.
  useEffect(() => {
    setFilePath((current) => {
      if (!current.star) return current;
      const star = findStar(stars, current.star);
      if (!star) return { star: null, planet: null };
      if (current.planet && !star.planets.some((planet) => planet.name === current.planet)) {
        return { star: current.star, planet: null };
      }
      return current;
    });
  }, [stars]);

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
      if (view === 'files') {
        if (kind === 'moon') {
          const location = locateMoon(stars, item.id);
          if (location) setFilePath({ star: location.star, planet: location.planet });
          setActiveMoonId(item.id);
          return;
        }
        if (kind === 'planet') {
          setFilePath({ star: starNameOf(item), planet: item.title });
          return;
        }
        setFilePath({ star: starNameOf(item), planet: null });
        return;
      }
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
    [requestFocus, stars, view],
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

  /* ------------------------------------------------- context actions */

  const performDelete = useCallback(async (target: SolarTarget) => {
    setDeleteTarget(null);
    try {
      const removed = await deleteSolarTarget(target);
      const removedMoonIds = new Set(target.items.map((moon) => moon.id));
      setActiveMoonId((current) => (current && removedMoonIds.has(current) ? null : current));
      setActiveStar((current) =>
        target.kind === 'star' && current === target.star ? null : current,
      );
      setExpandedPlanet((current) =>
        target.kind === 'star' || (target.kind === 'planet' && current === target.planet)
          ? null
          : current,
      );
      setSelectedPlanetKey((current) =>
        target.kind === 'star' ||
        (target.kind === 'planet' && current === planetKey(target.star, target.planet ?? ''))
          ? null
          : current,
      );
      setFilePath((current) => {
        if (target.kind === 'star' && current.star === target.star) {
          return { star: null, planet: null };
        }
        if (
          target.kind === 'planet' &&
          current.star === target.star &&
          current.planet === target.planet
        ) {
          return { star: target.star, planet: null };
        }
        return current;
      });
      setSyncStatus(
        removed > 1
          ? `Deleted ${target.kind} “${target.title}” and ${removed - 1} nested item${
              removed - 1 === 1 ? '' : 's'
            }`
          : `Deleted ${target.kind} “${target.title}”`,
      );
    } catch (error) {
      console.error('Delete failed:', error);
      setSyncStatus(`Delete failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  const requestDelete = useCallback(
    (target: SolarTarget) => {
      // Moons and empty folders delete immediately; containers with children ask first.
      if (target.kind === 'moon' || target.items.length === 0) {
        void performDelete(target);
        return;
      }
      setDeleteTarget(target);
    },
    [performDelete],
  );

  const handleContextAction = useCallback(
    (action: ItemContextAction) => {
      const target = contextMenuState?.target;
      if (!target) return;
      closeContextMenu();
      if (action === 'ask') {
        aiBindingTokenRef.current += 1;
        setAiBinding({ ...describeTarget(target), token: aiBindingTokenRef.current });
        return;
      }
      if (action === 'move') {
        setMoveTarget(target);
        return;
      }
      if (action === 'ai-move') {
        setAiMoveTarget(target);
        return;
      }
      requestDelete(target);
    },
    [closeContextMenu, contextMenuState, requestDelete],
  );

  const handleMoveItem = useCallback(
    async (target: SolarTarget, destination: { star: SolarStar; planet: SolarPlanet }) => {
      const result = await moveSolarTarget(target, destination);
      setSyncStatus(
        `Moved ${result.moved} moon${result.moved === 1 ? '' : 's'} to ${
          destination.star.name
        } › ${destination.planet.name}`,
      );
    },
    [],
  );

  const handleAiMoveItem = useCallback(
    async (target: SolarTarget, instruction: string): Promise<string> => {
      const allowed = target.items.map((moon) => moon.id);
      const context = describeTarget(target);
      const result = await chatWithAI({
        message: [
          `Move or organize this ${target.kind} “${target.title}” (star: ${target.star}${
            target.planet ? `, planet: ${target.planet}` : ''
          }).`,
          `Target node id: ${target.id ?? '(implicit folder)'} (${target.kind}).`,
          `Only change these moon ids: ${allowed.join(', ') || '(none)'}.`,
          `User instruction: ${instruction}`,
        ].join('\n'),
        history: [],
        moon: {
          title: context.title,
          text: context.text,
          status: context.status ?? 'ok',
          note: context.note,
        },
        index: buildChatIndex(stars),
      });

      const allowedIds = new Set(allowed);
      const planets = (result.planets ?? [])
        .map((planet) => ({
          name: planet.name,
          moonIds: planet.item_ids.filter((id) => allowedIds.has(id)),
        }))
        .filter((planet) => planet.name.trim().length > 0 && planet.moonIds.length > 0);

      if (planets.length === 0) {
        return (
          result.reply ||
          'The AI did not suggest a destination. Try naming the star and planet you want.'
        );
      }

      const applied = await applyOrganizePlan(
        { starName: result.star_name, starColor: result.star_color, planets },
        stars,
      );
      const summary = `Moved ${applied.moved} moon${
        applied.moved === 1 ? '' : 's'
      } into ${applied.planets.join(', ')} under ${applied.star}.`;
      setSyncStatus(summary);
      return [result.reply, summary].filter(Boolean).join('\n\n');
    },
    [stars],
  );

  const openDocument = useCallback((moon: MindItem) => {
    setActiveMoonId(moon.id);
  }, []);

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
      if (event.key !== 'Escape') return;
      // Overlays own Escape while open; don't clear panels underneath them.
      if (moveTarget || aiMoveTarget || deleteTarget || contextMenuState) return;
      if (importOpen) setImportOpen(false);
      else if (activeMoonId) setActiveMoonId(null);
      else if (activeStar) setActiveStar(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeMoonId,
    activeStar,
    importOpen,
    moveTarget,
    aiMoveTarget,
    deleteTarget,
    contextMenuState,
  ]);

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
    if (view === 'files') {
      setFilePath({ star: null, planet: null });
      return;
    }
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

  /** Step up from a planet menu to the star menu. */
  function collapsePlanet() {
    setExpandedPlanet(null);
    setSelectedPlanetKey(null);
  }

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#000000] text-zinc-100">
      <div className="absolute inset-x-0 top-0 z-30 flex flex-wrap items-center gap-2 bg-transparent px-3 py-2">
        <div className="order-1 shrink-0">
          <ViewSwitcher value={view} onChange={setView} />
        </div>
        <div className="order-2 ml-auto shrink-0 sm:order-3">
          <AuthPanel onUserChange={handleUserChange} status={syncStatus} />
        </div>
        <div className="order-3 min-w-0 basis-full sm:order-2 sm:flex-1 sm:basis-auto">
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
      </div>

      {/* Kept mounted while hidden so toggling back preserves the camera and
          the galaxy buffers instead of rebuilding them. */}
      <section
        className={`absolute inset-0 z-0 bg-black pt-28 sm:pt-20 ${
          view === 'galaxy' ? '' : 'invisible pointer-events-none'
        }`}
        aria-hidden={view !== 'galaxy'}
      >
        <TopicGraph
          active={view === 'galaxy'}
          items={items}
          focusRequest={focusRequest}
          onArrive={handleArrive}
          selectedMoonId={activeMoonId}
          selectedPlanetKey={selectedPlanetKey}
          onSelectStar={handleSelectStar}
          onSelectPlanet={handleSelectPlanet}
          onSelectMoon={handleSelectMoon}
          onItemMenu={(target, point) => openContextMenu(target, point.x, point.y)}
        />
      </section>

      {view === 'files' && (
        <FileSystemView
          stars={stars}
          path={filePath}
          onNavigate={setFilePath}
          onOpenMoon={openDocument}
          bindItem={bindItemContext}
        />
      )}

      {/* One panel at a time, one level deeper at a time: star → planet →
          document, with the back arrow stepping up the same path. */}
      {solarStar && !activeMoon && (
        <SolarPanel
          star={solarStar}
          expandedPlanet={expandedPlanet}
          onTogglePlanet={togglePlanet}
          onOpenMoon={openMoon}
          onDeletePlanet={(planet) => requestDelete(targetFromPlanet(planet))}
          onBack={expandedPlanet ? collapsePlanet : undefined}
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
          onDelete={() => requestDelete(targetFromMoon(activeMoon, activeMoonPlanet))}
          onBack={view === 'galaxy' && activeStar ? () => setActiveMoonId(null) : undefined}
          onClose={() => setActiveMoonId(null)}
        />
      )}

      <AiChat
        stars={stars}
        activeMoon={activeMoon}
        binding={aiBinding}
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

      {contextMenuState && (
        <ItemContextMenu
          state={contextMenuState}
          onAction={handleContextAction}
          onClose={closeContextMenu}
        />
      )}

      {moveTarget && (
        <MoveItemDialog
          target={moveTarget}
          stars={stars}
          onClose={() => setMoveTarget(null)}
          onSubmit={(destination) => handleMoveItem(moveTarget, destination)}
        />
      )}

      {aiMoveTarget && (
        <AiMoveDialog
          target={aiMoveTarget}
          onClose={() => setAiMoveTarget(null)}
          onSubmit={(instruction) => handleAiMoveItem(aiMoveTarget, instruction)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => performDelete(deleteTarget)}
        />
      )}
    </main>
  );
}
