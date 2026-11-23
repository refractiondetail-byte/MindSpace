import { useEffect, useRef } from 'react';
import { REGION_META, type Region, type ThoughtNode } from '../../core/types';
import { formatDate } from '../format';
import { RegionFilter } from './RegionFilter';

interface SearchPanelProps {
  query: string;
  onQueryChange: (value: string) => void;
  region: Region | 'all';
  onRegionChange: (value: Region | 'all') => void;
  matches: ThoughtNode[];
  counts: Record<Region, number>;
  total: number;
  onPick: (node: ThoughtNode) => void;
  className?: string;
}

export function SearchPanel({
  query,
  onQueryChange,
  region,
  onRegionChange,
  matches,
  counts,
  total,
  onPick,
  className = '',
}: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();
  const results = trimmed ? matches.slice(0, 6) : [];
  const remaining = trimmed ? matches.length - results.length : 0;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable),
      );

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      if (event.key === '/' && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={`hud-panel relative flex flex-col gap-2.5 p-3 ${className}`}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (results[0]) onPick(results[0]);
        }}
      >
        <label className="relative block">
          <span className="sr-only">Search nodes</span>
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
            placeholder="Search your mind…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                onQueryChange('');
                inputRef.current?.blur();
              }
            }}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
            {trimmed ? `${matches.length} found` : `${total} nodes`}
          </span>
        </label>
      </form>

      <RegionFilter value={region} onChange={onRegionChange} counts={counts} total={total} />

      {trimmed && (
        <div className="hud-panel absolute inset-x-0 top-full z-30 mt-2 p-1.5">
          {results.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-slate-400">
              Nothing matches “{trimmed}”.
            </p>
          ) : (
            <ul className="flex flex-col">
              {results.map((node) => {
                const meta = REGION_META[node.region];
                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => onPick(node)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/10"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: meta.accent }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-slate-100">
                          {node.title}
                        </span>
                        <span className="block truncate text-[10px] text-slate-500">
                          {meta.label} · {formatDate(node.createdAt)}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-500">fly →</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {remaining > 0 && (
            <p className="px-2 pb-1 pt-1.5 text-[10px] text-slate-500">
              +{remaining} more {remaining === 1 ? 'match' : 'matches'} — keep typing to narrow.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
