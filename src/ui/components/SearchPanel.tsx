import { useEffect, useRef, useState } from 'react';
import { REGION_META, type Region, type ThoughtNode } from '../../core/types';
import { getClusterName } from '../../lib/clusterNames';
import type { RankedThought } from '../relevance';
import { relativeTime } from '../time';

interface SearchPanelProps {
  query: string;
  onQueryChange: (value: string) => void;
  region: Region | 'all';
  onRegionChange: (value: Region | 'all') => void;
  ranked: RankedThought[];
  counts: Record<Region, number>;
  total: number;
  onPick: (node: ThoughtNode) => void;
  className?: string;
  searchLabel?: string;
  clusterNames?: Record<Region, string>;
  onRenameCluster?: (region: Region, name: string) => void;
  loading?: boolean;
  aiAnswer?: string;
  aiReasons?: Record<string, string>;
}

export function SearchPanel({
  query,
  onQueryChange,
  region,
  onRegionChange,
  ranked,
  counts,
  total,
  onPick,
  className = '',
  searchLabel,
  clusterNames,
  onRenameCluster,
  loading = false,
  aiAnswer,
  aiReasons,
}: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const trimmed = query.trim();
  void region;
  void onRegionChange;
  void counts;
  void clusterNames;
  void onRenameCluster;
  const results = trimmed ? ranked.slice(0, 6) : [];
  const remaining = trimmed ? ranked.length - results.length : 0;

  useEffect(() => {
    if (trimmed) setExpanded(true);
  }, [trimmed]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable),
      );

      if (event.key === '/' && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!expanded && !trimmed) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={`hud-panel flex items-center gap-2 px-3 py-2 text-xs text-slate-300 transition hover:text-white ${className}`}
        title="Search (⌘K or /)"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-4 w-4 text-slate-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="hidden sm:inline">Search…</span>
        <span className="ml-auto text-[10px] text-slate-500">⌘K</span>
      </button>
    );
  }

  return (
    <div className={`search-outline hud-panel relative flex flex-col gap-2.5 p-3 ${className}`}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (results[0]) {
            onPick(results[0].node);
            onQueryChange('');
            setExpanded(false);
          }
        }}
      >
        <label className="relative block">
          <span className="sr-only">{searchLabel ?? 'Search nodes'}</span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            className="field pl-9 pr-20"
            placeholder={searchLabel ?? 'Search your mind…'}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                onQueryChange('');
                if (!query.trim()) setExpanded(false);
                inputRef.current?.blur();
              }
            }}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
            {trimmed ? `${ranked.length} found` : `${total} nodes`}
          </span>
        </label>
      </form>

      {(loading || aiAnswer) && (
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          {loading && <span className="inline-block h-3 w-3 animate-spin rounded-full border border-zinc-500 border-t-transparent" />}
          <span>{loading ? 'Refining with AI…' : aiAnswer}</span>
        </div>
      )}

      {trimmed && (
        <div className="mt-1 border-t border-white/[0.07] pt-1.5">
          {results.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-slate-400">
              Nothing matches “{trimmed}”.
            </p>
          ) : (
            <ul className="flex flex-col">
              {results.map((entry, index) => {
                const { node, relevance, reasons } = entry;
                const meta = REGION_META[node.region];
                const percent = Math.round(relevance * 100);

                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(node);
                        onQueryChange('');
                        setExpanded(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/10 ${
                        index === 0 ? 'bg-white/[0.06]' : ''
                      }`}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: meta.accent }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-medium text-slate-100">
                            {node.title}
                          </span>
                          {index === 0 && (
                            <span
                              className="shrink-0 rounded px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em]"
                              style={{
                                backgroundColor: `${meta.accent}1f`,
                                color: meta.accent,
                              }}
                            >
                              top
                            </span>
                          )}
                        </span>

                        <span className="mt-1 flex items-center gap-1.5">
                          <span
                            className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-white/10"
                            role="img"
                            aria-label={`Relevance ${percent}%`}
                          >
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${percent}%`,
                                backgroundColor: meta.accent,
                              }}
                            />
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                            {percent}%
                          </span>
                          <span className="truncate text-[10px] text-slate-500">
                            {aiReasons?.[node.id]
                              ? aiReasons[node.id]
                              : reasons.length > 0
                                ? reasons.join(' · ')
                                : `${getClusterName(clusterNames, node.region)} · ${relativeTime(node.createdAt)}`}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-500">
                        fly →
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {remaining > 0 && (
            <p className="px-2 pb-0.5 pt-1.5 text-[10px] text-slate-500">
              +{remaining} more {remaining === 1 ? 'match' : 'matches'} — keep typing to narrow.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
