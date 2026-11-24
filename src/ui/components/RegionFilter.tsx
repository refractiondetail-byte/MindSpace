import { useState } from 'react';
import { REGIONS, REGION_META, type Region } from '../../core/types';
import { getClusterName } from '../../lib/clusterNames';

interface RegionFilterProps {
  value: Region | 'all';
  onChange: (value: Region | 'all') => void;
  counts: Record<Region, number>;
  total: number;
  clusterNames?: Record<Region, string>;
  onRename?: (region: Region, name: string) => void;
}

export function RegionFilter({ value, onChange, counts, total, clusterNames, onRename }: RegionFilterProps) {
  const [editing, setEditing] = useState<Region | null>(null);
  const [draft, setDraft] = useState('');

  return (
    <div className="flex flex-wrap gap-2">
      <FilterChip active={value === 'all'} label="All" count={total} onClick={() => onChange('all')} />
      {REGIONS.map((region) => {
        const meta = REGION_META[region];
        const label = getClusterName(clusterNames, region);
        if (editing === region) {
          return (
            <form
              key={region}
              onSubmit={(event) => {
                event.preventDefault();
                onRename?.(region, draft);
                setEditing(null);
              }}
              className="inline-flex items-center gap-1"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.accent }} />
              <input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                  onRename?.(region, draft);
                  setEditing(null);
                }}
                className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-xs text-white"
              />
            </form>
          );
        }
        return (
          <FilterChip
            key={region}
            active={value === region}
            label={label}
            count={counts[region]}
            accent={meta.accent}
            hint={meta.description}
            onClick={() => onChange(region)}
            onDoubleClick={() => {
              setDraft(label);
              setEditing(region);
            }}
          />
        );
      })}
    </div>
  );
}

interface FilterChipProps {
  active: boolean;
  label: string;
  count: number;
  accent?: string;
  hint?: string;
  onClick: () => void;
  onDoubleClick?: () => void;
}

function FilterChip({ active, label, count, accent = '#c7d2fe', hint, onClick, onDoubleClick }: FilterChipProps) {
  return (      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        aria-pressed={active}
      title={hint}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-transparent bg-white/15 text-white'
          : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200'
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      {label}
      <span className="text-[10px] font-semibold text-slate-500">{count}</span>
    </button>
  );
}
