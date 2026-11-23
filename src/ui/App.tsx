import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listThoughts } from '../core/repository';
import { filterThoughts } from '../core/search';
import type { Region, ThoughtNode } from '../core/types';
import { WorldCanvas } from '../worlds/WorldCanvas';
import { DEFAULT_WORLD_THEME, getWorldTheme, type WorldTheme } from '../worlds/themes';
import { NodeInspector } from './components/NodeInspector';
import { QuickCapture } from './components/QuickCapture';
import { SearchPanel } from './components/SearchPanel';
import { ThemeSwitcher } from './components/ThemeSwitcher';

export default function App() {
  const thoughts = useLiveQuery(() => listThoughts(), []);
  const [themeId, setThemeId] = useState<WorldTheme>(DEFAULT_WORLD_THEME);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<Region | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ nodeId: string | null; token: number } | null>(null);
  const focusToken = useRef(0);

  const nodes = useMemo(() => thoughts ?? [], [thoughts]);
  const theme = getWorldTheme(themeId);

  const matches = useMemo(
    () => filterThoughts(nodes, { query, regions: region === 'all' ? [] : [region] }),
    [nodes, query, region],
  );

  const filtersActive = query.trim().length > 0 || region !== 'all';
  const activeIds = useMemo(
    () => (filtersActive ? new Set(matches.map((node) => node.id)) : null),
    [filtersActive, matches],
  );

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
  }, []);

  const recenter = useCallback(() => {
    focusToken.current += 1;
    setFocus({ nodeId: null, token: focusToken.current });
  }, []);

  const handlePick = useCallback(
    (node: ThoughtNode) => {
      focusNode(node.id);
    },
    [focusNode],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedId(null);
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

  const loading = thoughts === undefined;
  const total = nodes.length;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden" style={rootStyle}>
      <div className="absolute inset-0">
        <WorldCanvas
          thoughts={nodes}
          themeId={themeId}
          selectedId={selectedId}
          activeIds={activeIds}
          focus={focus}
          onSelect={focusNode}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(130%_120%_at_50%_50%,transparent_58%,rgba(0,0,0,0.5)_100%)]" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 grid gap-2 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,460px)_minmax(0,1fr)] md:items-start">
        <div className="flex items-start justify-between gap-2 md:justify-start">
          <div className="hud-panel pointer-events-auto flex items-center gap-2.5 px-3 py-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-sm">
              🧠
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-white">MindSpace</p>
              <p className="text-[10px] text-slate-400">
                {loading
                  ? 'opening local store…'
                  : `${total} ${total === 1 ? 'node' : 'nodes'} · local-only`}
              </p>
            </div>
          </div>
          <div className="pointer-events-auto md:hidden">
            <ThemeSwitcher value={themeId} onChange={setThemeId} />
          </div>
        </div>

        <SearchPanel
          className="pointer-events-auto"
          query={query}
          onQueryChange={setQuery}
          region={region}
          onRegionChange={setRegion}
          matches={matches}
          counts={counts}
          total={total}
          onPick={handlePick}
        />

        <div className="pointer-events-auto hidden items-start justify-end gap-2 md:flex">
          <button
            type="button"
            onClick={recenter}
            className="hud-chip"
            title="Recenter the camera"
          >
            ⌖ <span className="hidden lg:inline">Recenter</span>
          </button>
          <ThemeSwitcher value={themeId} onChange={setThemeId} />
        </div>
      </header>

      <div className="pointer-events-auto absolute bottom-3 left-3 z-20 w-[min(360px,calc(100vw-1.5rem))] sm:bottom-4 sm:left-4">
        <QuickCapture onSaved={(node) => focusNode(node.id)} />
      </div>

      <p className="pointer-events-none absolute bottom-5 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-slate-400 backdrop-blur lg:block">
        drag to orbit · scroll to zoom · click a node to fly in
      </p>

      <NodeInspector
        node={selected}
        thoughts={nodes}
        onClose={() => setSelectedId(null)}
        onFocus={focusNode}
      />
    </main>
  );
}
