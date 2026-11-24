import { useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listThoughts } from '../core/repository';
import type { Region, ThoughtNode } from '../core/types';
import { WorldCanvas } from '../worlds/WorldCanvas';
import { getWorldTheme, type WorldTheme } from '../worlds/themes';
import { rankThoughts } from './relevance';
import { loadVisits, recordVisit } from './visits';
import { CapturePage } from './components/CapturePage';
import { NodeInspector } from './components/NodeInspector';
import { SearchPanel } from './components/SearchPanel';
import { TogglePill } from './components/TogglePill';
import {
  buildActivitySeries,
  estimateTodayMood,
  summarizeWeek,
  type WeekSummary,
} from './insights';
import { relativeTime, useNow } from './time';
import { REGION_META, REGIONS } from '../core/types';
import { loadClusterNames } from '../lib/clusterNames';
import { AuthPanel } from './components/AuthPanel';
import { db } from '../core/db';
import { loadUserGalaxy, saveUserGalaxy } from '../lib/supabaseSync';
import { useClusterNames } from './hooks/useClusterNames';
import { CheckInForm } from './components/DailyCheckIn';


export default function App() {
  const thoughts = useLiveQuery(() => listThoughts(), []);
  const [mode, setMode] = useState<'world' | 'home'>('world');
  const themeId: WorldTheme = 'galaxy';
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<Region | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ nodeId: string | null; token: number } | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [tilt, setTilt] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [syncLoaded, setSyncLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [fireCount, setFireCount] = useState(0);
  const [visits, setVisits] = useState<Record<string, string>>(() => loadVisits());
  const [clusterNames, renameCluster, setClusterNames] = useClusterNames();
  const now = useNow();

  const handleUserChange = useCallback(async (id: string | null) => {
    setUserId(id);
    setSyncLoaded(false);
    if (!id) return;
    try {
      const state = await loadUserGalaxy(id);
      if (state?.nodes) {
        await db.thoughts.clear();
        if (state.nodes.length) await db.thoughts.bulkAdd(state.nodes);
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

  const focusToken = useRef(0);

  const nodes = useMemo(() => thoughts ?? [], [thoughts]);

  useEffect(() => {
    if (!userId || !syncLoaded) return;
    const timer = window.setTimeout(() => {
      void saveUserGalaxy(userId, {
        nodes,
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
  }, [userId, syncLoaded, nodes, clusterNames, tilt]);
  const theme = getWorldTheme('galaxy');

  const ranked = useMemo(
    () => rankThoughts(nodes, { query, region }),
    [nodes, query, region],
  );

  const filtersActive = query.trim().length > 0 || region !== 'all';
  const activeIds = useMemo(
    () => (filtersActive ? new Set(ranked.map((entry) => entry.node.id)) : null),
    [filtersActive, ranked],
  );

  /** The three strongest live matches get a soft ring in the 3D scene.
 * We compute `ranked` here for relevance, but `HomeDashboard` receives
 * its own `query`/`setQuery` from the parent `App` component.
 */
  const emphasisIds = useMemo(() => {
    if (!query.trim()) return null;
    const top = ranked.slice(0, 3);
    return top.length > 0 ? new Set(top.map((entry) => entry.node.id)) : null;
  }, [query, ranked]);

  const counts = useMemo(() => {
    const base: Record<Region, number> = {
      prefrontal: 0,
      hippocampus: 0,
      limbic: 0,
      parietal: 0,
    };
    for (const node of nodes) base[node.region] += 1;
    return base;
  }, [nodes]);

  const selected = useMemo(
    () => nodes.find((node) => node.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const focusNode = useCallback((nodeId: string) => {
    focusToken.current += 1;
    setSelectedId(nodeId);
    setFocus({ nodeId, token: focusToken.current });
    setVisits(recordVisit(nodeId));
    setFireCount((current) => current + 1);
  }, []);

  const recenter = useCallback(() => {
    focusToken.current += 1;
    setFocus({ nodeId: null, token: focusToken.current });
  }, []);

  const handleCheckInSaved = useCallback(
    (node: ThoughtNode) => {
      focusNode(node.id);
      setMode('world');
    },
    [focusNode],
  );

  const handlePick = useCallback(
    (node: ThoughtNode) => {
      focusNode(node.id);
    },
    [focusNode],
  );

  const handleOverviewPick = useCallback(
    (node: ThoughtNode) => {
      focusNode(node.id);
      // Keep the home dashboard mounted briefly so the neural pulse can fire.
      window.setTimeout(() => setMode('world'), 750);
    },
    [focusNode],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedId(null);
        setMode('world');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const rootStyle: CSSProperties = {
    background: theme.background,
    ...({
      '--hud-surface': theme.hud.surface,
      '--hud-border': theme.hud.border,
      '--hud-accent': theme.hud.accent,
    } as CSSProperties),
  };

  const total = nodes.length;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden" style={rootStyle}>
      <div className="absolute inset-0">
        <WorldCanvas
          thoughts={nodes}
          themeId={themeId}
          clusterNames={clusterNames}
          selectedId={selectedId}
          activeIds={activeIds}
          emphasisIds={emphasisIds}
          focus={focus}
          homeMode={mode === 'home'}
          tilt={tilt}
          onSelect={focusNode}
        />
      </div>

      {mode === 'world' && (
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(130%_120%_at_50%_50%,transparent_58%,rgba(0,0,0,0.5)_100%)]" />
      )}

      <div className="pointer-events-auto absolute inset-x-0 top-0 z-20 flex items-center gap-2 overflow-x-auto px-3 py-2 touch-pan-x scrollbar-none">
        {mode === 'world' && (
          <SearchPanel
            className="shrink-0"
            query={query}
            clusterNames={clusterNames}
            onRenameCluster={renameCluster}
            onQueryChange={setQuery}
            region={region}
            onRegionChange={setRegion}
            ranked={ranked}
            counts={counts}
            total={total}
            onPick={handlePick}
          />
        )}
        {mode === 'world' && (
          <input
            type="range"
            min={-60}
            max={60}
            step={1}
            value={Math.round((tilt * 180) / Math.PI)}
            onChange={(event) => setTilt((Number(event.target.value) * Math.PI) / 180)}
            className="galaxy-tilt shrink-0 w-32 sm:w-48"
            title="Tilt galaxy"
          />
        )}
        {mode === 'world' && (
          <button
            type="button"
            onClick={recenter}
            className="hud-chip shrink-0"
            title="Recenter the camera"
          >
            ⌖ <span className="hidden lg:inline">Recenter</span>
          </button>
        )}
        <AuthPanel onUserChange={handleUserChange} status={syncStatus} />
        <TogglePill
          value={mode}
          onChange={(next) => setMode(next)}
          localOnly
        />
      </div>

      {mode === 'home' && (
        <HomeDashboard
          thoughts={nodes}
          visits={visits}
          now={now}
          onClose={() => setMode('world')}
          onSaved={handleCheckInSaved}
          onCapture={() => {}}
          onPick={handleOverviewPick}
          query={query}
          setQuery={setQuery}
          fireCount={fireCount}
          clusterNames={clusterNames}
        />
      )}

      <div className="pointer-events-auto absolute bottom-4 left-4 z-20">
        <button
          type="button"
          onClick={() => setCaptureOpen(true)}
          className="hud-chip"
          title="Capture text or files"
        >
          ✎ Capture
        </button>
      </div>

      {captureOpen && (
        <CapturePage
          onClose={() => setCaptureOpen(false)}
          onSaved={(node) => {
            focusNode(node.id);
            setCaptureOpen(false);
            setMode('world');
          }}
        />
      )}


      <NodeInspector
        node={selected}
        thoughts={nodes}
        touchedAt={selectedId ? visits[selectedId] ?? null : null}
        onClose={() => setSelectedId(null)}
        onFocus={focusNode}
      />

    </main>
  );
}

function HomeDashboard({
  thoughts,
  visits,
  now,
  onClose,
  onSaved,
  onCapture: _onCapture,
  onPick,
  query,
  setQuery,
  fireCount,
  clusterNames,
}: {
  thoughts: ThoughtNode[];
  visits: Record<string, string>;
  now: Date;
  onClose: () => void;
  onSaved: (node: ThoughtNode) => void;
  onCapture: () => void;
  onPick: (node: ThoughtNode) => void;
  query: string;
  setQuery: (value: string | ((prev: string) => string)) => void;
  fireCount: number;
  clusterNames?: Record<Region, string>;
}) {
  const [region, setRegion] = useState<Region | 'all'>('all');
  const counts = useMemo(() => {
    const base: Record<Region, number> = {
      prefrontal: 0,
      hippocampus: 0,
      limbic: 0,
      parietal: 0,
    };
    for (const node of thoughts) base[node.region] += 1;
    return base;
  }, [thoughts]);
  const ranked = useMemo(() => rankThoughts(thoughts, { query, region }), [thoughts, query, region]);

  return (
    <>
      <aside
        role="dialog"
        aria-label="Home telemetry dashboard"
        className="pointer-events-auto hud-panel absolute left-1/2 top-24 z-20 w-full max-w-[1100px] -translate-x-1/2 p-4 touch-pan-y overscroll-contain sm:static sm:inset-0 sm:max-w-none sm:translate-x-0 sm:flex sm:flex-col"
      >
        <div className="mb-3">
          <SearchPanel
            query={query}
            onQueryChange={setQuery}
            region={region}
            onRegionChange={setRegion}
            ranked={ranked}
            counts={counts}
            total={thoughts.length}
            onPick={onPick}
            clusterNames={clusterNames}
            searchLabel="Search every page, thought, and connection…"
          />
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto sm:overflow-y-visible lg:grid lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="flex flex-wrap items-start gap-2">
            <TelemetryKpis thoughts={thoughts} visits={visits} now={now} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <LinesFiredCard thoughts={thoughts} />
            <TodayFeelingCard thoughts={thoughts} now={now} />
            <NeuronVisualizer fireCount={fireCount} />
          </div>

          <FileManager thoughts={thoughts} clusterNames={clusterNames} onPick={onPick} />

          <div className="space-y-4 lg:border-l lg:border-white/10 lg:pl-6 lg:pr-4 lg:pt-2">
            <TelemetryTrend thoughts={thoughts} now={now} />

            <TelemetryGroupBreakdown thoughts={thoughts} now={now} />

            <section className="border-t border-white/5 pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Most connected
                </h3>
                <span className="text-[10px] text-slate-500">ranked by link count</span>
              </div>
              <MostConnectedList thoughts={thoughts} onPick={(node) => onPick(node)} />

            </section>

            <section className="border-t border-white/5 pt-3 flex flex-col gap-3">
              <RecentActivityList thoughts={thoughts} />
              <CheckInForHome onSaved={onSaved} />
            </section>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/25 hover:text-white"
          >
            Back to 3D view
          </button>
        </div>
      </aside>
    </>
  );
}

function TelemetryKpis({ thoughts, visits, now }: { thoughts: ThoughtNode[]; visits: Record<string, string>; now: Date }) {
  const totalLinks = useMemo(() => {
    const pairs = new Set<string>();
    for (const node of thoughts) {
      for (const targetId of node.links) {
        if (targetId === node.id) continue;
        pairs.add(node.id < targetId ? `${node.id}|${targetId}` : `${targetId}|${node.id}`);
      }
    }
    return pairs.size;
  }, [thoughts]);

  const updatedThisWeek = useMemo(() => {
    const since = now.getTime() - 7 * 86_400_000;
    return thoughts.filter((node) => {
      const created = new Date(node.createdAt).getTime();
      if (Number.isFinite(created) && created >= since) return true;
      const touched = visits[node.id] ? new Date(visits[node.id]).getTime() : NaN;
      return Number.isFinite(touched) && touched >= since;
    }).length;
  }, [thoughts, visits, now]);

  const totalTypes = new Set(thoughts.map((node) => node.type)).size;
  const totalRegions = new Set(thoughts.map((node) => node.region)).size;
  const weekPercent = thoughts.length > 0 ? Math.round((updatedThisWeek / thoughts.length) * 100) : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <TelemetryCard
        label="Total items"
        value={thoughts.length}
        accent={REGION_META.prefrontal.accent}
        barPercent={thoughts.length > 0 ? 100 : 0}
      />
      <TelemetryCard
        label="Type / section"
        value={`${totalTypes} · ${totalRegions}`}
        accent={REGION_META.hippocampus.accent}
        barPercent={100}
      />
      <TelemetryCard
        label="Total links"
        value={totalLinks}
        accent={REGION_META.parietal.accent}
        barPercent={totalLinks > 0 ? 100 : 0}
      />
      <TelemetryCard
        label="Updated this week"
        value={updatedThisWeek}
        accent={REGION_META.limbic.accent}
        badgePercent={weekPercent}
        barPercent={weekPercent}
      />
    </div>
  );
}

function TelemetryCard({ label, value, accent, barPercent, badgePercent }: {
  label: string;
  value: string | number;
  accent: string;
  barPercent: number;
  badgePercent?: number;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
        {badgePercent !== undefined && (
          <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-300">
            {badgePercent}%
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold leading-none text-white tabular-nums">{value}</p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(2, Math.min(100, barPercent))}%`,
            backgroundColor: accent,
          }}
        />
      </div>
    </div>
  );
}

function TelemetryTrend({ thoughts, now }: { thoughts: ThoughtNode[]; now: Date }) {
  const series = useMemo(() => buildActivitySeries(thoughts, now, 14), [thoughts, now]);
  const max = Math.max(1, ...series.map((point) => point.count));

  return (
    <section className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Activity / updates over time
        </h3>
        <span className="text-[10px] text-slate-500">last 14 days</span>
      </div>
      <div className="mt-3 flex h-24 gap-[2px]" role="img" aria-label="Daily captures over the last 14 days">
        {series.map((point) => (
          <div
            key={point.key}
            className="relative flex-1 flex flex-col justify-end"
            title={`${point.label}: ${point.count} ${point.count === 1 ? 'capture' : 'captures'}`}
          >
            <div
              className="rounded-t-sm"
              style={{
                height: `${Math.max(point.count > 0 ? 12 : 3, (point.count / max) * 100)}%`,
                backgroundColor: 'var(--hud-accent)',
                opacity: point.count > 0 ? 0.55 : 0.14,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.14em] text-slate-600">
        <span>{series[0]?.label}</span>
        <span>today</span>
      </div>
    </section>
  );
}

function TelemetryGroupBreakdown({ thoughts, now }: { thoughts: ThoughtNode[]; now: Date }) {
  const week: WeekSummary = useMemo(() => summarizeWeek(thoughts, now), [thoughts, now]);
  const max = Math.max(1, ...Object.values(week.regions));

  return (
    <section className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Breakdown by group / unit
      </h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {REGIONS.map((region) => {
          const meta = REGION_META[region];
          const count = week.regions[region];
          return (
            <div key={region} className="flex items-center gap-2 text-[10px]">
              <span className="w-[74px] shrink-0 truncate text-slate-400">
                {loadClusterNames()[region] ?? meta.label}
              </span>
              <div className="flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(count / max) * 100}%`,
                    backgroundColor: meta.accent,
                  }}
                />
              </div>
              <span className="w-4 text-right font-medium text-slate-300">
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {week.tags.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Tags this week</p>
          <ul className="mt-1.5 flex flex-col gap-2">
            {week.tags.slice(0, 4).map(({ tag, count }) => (
              <li key={tag} className="flex items-center gap-2 text-[10px]">
                <span className="truncate text-slate-300">#{tag}</span>
                <div className="flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(count / week.tags[0].count) * 100}%`,
                      backgroundColor: 'var(--hud-accent)',
                    }}
                  />
                </div>
                <span className="w-4 text-right text-slate-500">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function MostConnectedList({ thoughts, onPick }: { thoughts: ThoughtNode[]; onPick: (node: ThoughtNode) => void }) {
  const ranked = useMemo(() => {
    const neighbors = new Map<string, number>();
    for (const node of thoughts) neighbors.set(node.id, 0);
    for (const node of thoughts) {
      for (const targetId of node.links) {
        if (targetId === node.id || !neighbors.has(targetId)) continue;
        neighbors.set(node.id, (neighbors.get(node.id) ?? 0) + 1);
      }
    }
    return thoughts
      .map((node) => ({ node, degree: neighbors.get(node.id) ?? 0 }))
      .filter((entry) => entry.degree > 0)
      .sort((a, b) => b.degree - a.degree || a.node.title.localeCompare(b.node.title))
      .slice(0, 6);
  }, [thoughts]);

  if (ranked.length === 0) {
    return (
      <p className="mt-1.5 text-[11px] text-slate-500">
        No explicit links yet — connect two thoughts to start a constellation.
      </p>
    );
  }

  return (
    <ul className="mt-1.5 flex flex-col gap-1">
      {ranked.map(({ node, degree }) => (
        <li key={node.id}>
          <button
            type="button"
            onClick={() => onPick(node)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5"
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: REGION_META[node.region].accent }}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
              {node.title}
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
              {degree} {degree === 1 ? 'link' : 'links'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RecentActivityList({ thoughts }: { thoughts: ThoughtNode[] }) {
  const recent = useMemo(() => {
    return [...thoughts]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4);
  }, [thoughts]);

  return (
    <>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Recent activity
      </h3>
      <ul className="mt-1.5 flex flex-col gap-1">
        {recent.map((node) => (
          <li key={node.id} className="flex items-center gap-2 text-[10px]">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: REGION_META[node.region].accent }}
            />
            <span className="min-w-0 flex-1 truncate text-slate-300">{node.title}</span>
            <span className="shrink-0 text-slate-500">
              {relativeTime(node.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function LinesFiredCard({ thoughts }: { thoughts: ThoughtNode[] }) {
  const totalLinks = useMemo(() => {
    const pairs = new Set<string>();
    for (const node of thoughts) {
      for (const targetId of node.links) {
        if (targetId === node.id) continue;
        pairs.add(node.id < targetId ? `${node.id}|${targetId}` : `${targetId}|${node.id}`);
      }
    }
    return pairs.size;
  }, [thoughts]);

  const directed = thoughts.reduce((sum, node) => sum + node.links.length, 0);
  const neuronsWithLinks = thoughts.filter((node) => node.links.length > 0).length;

  return (
    <section className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Lines fired
      </h3>
      <p className="mt-1 text-2xl font-semibold leading-none text-white tabular-nums">
        {totalLinks}
      </p>
      <p className="mt-1 text-[10px] text-slate-500">
        {directed} directed · {neuronsWithLinks} neurons connected
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, totalLinks * 4)}%`,
            backgroundColor: 'var(--hud-accent)',
          }}
        />
      </div>
    </section>
  );
}

function TodayFeelingCard({ thoughts, now }: { thoughts: ThoughtNode[]; now: Date }) {
  const estimate = useMemo(() => estimateTodayMood(thoughts, now), [thoughts, now]);
  const tone =
    estimate.score > 0
      ? 'text-emerald-300'
      : estimate.score < 0
        ? 'text-rose-300'
        : 'text-slate-300';

  return (
    <section className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Feeling today (estimate)
      </h3>
      <p className={`mt-1 text-2xl font-semibold leading-none tabular-nums ${tone}`}>
        {estimate.score > 0 ? `+${estimate.score}` : estimate.score}
      </p>
      <p className="mt-1 text-[10px] text-slate-400">{estimate.label}</p>
      {estimate.source && (
        <p className="mt-1 truncate text-[10px] text-slate-500" title={estimate.source}>
          based on “{estimate.source}”
        </p>
      )}
    </section>
  );
}

function NeuronVisualizer({ fireCount }: { fireCount: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const barsRef = useRef<number[]>(Array.from({ length: 24 }, () => 0));
  const rafRef = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 2000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (fireCount === 0 && tick === 0) return;

    // Boost bars.
    barsRef.current = barsRef.current.map(() => Math.random() * 0.6 + 0.4);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let start: number | null = null;
    const duration = 700;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    function frame(timestamp: number) {
      if (start === null) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(1, elapsed / duration);
      const decay = 1 - progress;

      const width = canvas!.width;
      const height = canvas!.height;
      ctx!.clearRect(0, 0, width, height);
      const barCount = barsRef.current.length;
      const gap = 2;
      const barWidth = (width - gap * (barCount - 1)) / barCount;
      for (let i = 0; i < barCount; i += 1) {
        const base = barsRef.current[i] ?? 0;
        const h = base * decay * height * 0.9 + 2;
        const x = i * (barWidth + gap);
        const y = height - h;
        ctx!.fillStyle = 'rgba(99, 179, 237, 0.85)';
        ctx!.fillRect(x, y, barWidth, h);
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        ctx!.clearRect(0, 0, width, height);
        rafRef.current = null;
      }
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [fireCount, tick]);

  return (
    <section className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Neural pulse
        </h3>
        <span className="text-[10px] text-slate-500">{fireCount} fired</span>
      </div>
      <canvas
        ref={canvasRef}
        width={240}
        height={48}
        className="mt-2 h-12 w-full rounded-lg bg-black/30"
      />
      <p className="mt-1 text-[10px] text-slate-500">
        Fires on every neuron selection.
      </p>
    </section>
  );
}

function FileManager({
  thoughts,
  clusterNames,
  onPick,
}: {
  thoughts: ThoughtNode[];
  clusterNames?: Record<Region, string>;
  onPick: (node: ThoughtNode) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<Region, ThoughtNode[]>();
    for (const region of REGIONS) map.set(region, []);
    for (const node of thoughts) map.get(node.region)?.push(node);
    for (const members of map.values()) {
      members.sort((a, b) => a.title.localeCompare(b.title));
    }
    return map;
  }, [thoughts]);

  return (
    <section className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          File manager
        </h3>
        <span className="text-[10px] text-slate-500">clusters · topics · planets</span>
      </div>
      <div className="mt-2 space-y-3">
        {REGIONS.map((region) => {
          const members = grouped.get(region) ?? [];
          const name = clusterNames?.[region] ?? REGION_META[region].label;
          return (
            <div key={region} className="rounded-lg border border-white/5 bg-black/20 p-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: REGION_META[region].accent }}
                />
                <span className="text-[11px] font-semibold text-slate-200">{name}</span>
                <span className="text-[10px] text-slate-500">{members.length}</span>
              </div>
              {members.length === 0 ? (
                <p className="mt-1 text-[10px] text-slate-500">Empty cluster</p>
              ) : (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {members.map((node) => (
                    <li key={node.id} className="rounded-md bg-white/[0.03] px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => onPick(node)}
                        className="flex w-full items-center gap-2 text-left transition hover:text-white"
                      >
                        <span className="text-[10px] text-slate-400">📄</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
                          {node.title}
                        </span>
                        {node.attachments.length > 0 && (
                          <span className="shrink-0 text-[10px] text-slate-500">
                            {node.attachments.length} planet{node.attachments.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </button>
                      {node.attachments.length > 0 && (
                        <ul className="mt-1 flex flex-col gap-0.5 pl-5">
                          {node.attachments.map((attachment) => (
                            <li
                              key={attachment.id}
                              className="flex items-center gap-1.5 text-[10px] text-slate-400"
                            >
                              <span>🪐</span>
                              <span className="truncate">{attachment.name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CheckInForHome({ onSaved }: { onSaved: (node: ThoughtNode) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Check-in / nudges
      </h3>
      <p className="text-[10px] text-slate-500">
        Log a mood or name today's unit so this week gets shape.
      </p>
      <CheckInForm onSaved={onSaved} compact />
    </div>
  );
}
