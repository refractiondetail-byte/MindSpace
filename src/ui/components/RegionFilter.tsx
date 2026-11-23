import { REGIONS, REGION_META, type Region } from '../../core/types';

interface RegionFilterProps {
  value: Region | 'all';
  onChange: (value: Region | 'all') => void;
  counts: Record<Region, number>;
  total: number;
}

export function RegionFilter({ value, onChange, counts, total }: RegionFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <FilterChip active={value === 'all'} label="All" count={total} onClick={() => onChange('all')} />
      {REGIONS.map((region) => {
        const meta = REGION_META[region];
        return (
          <FilterChip
            key={region}
            active={value === region}
            label={meta.label}
            count={counts[region]}
            accent={meta.accent}
            hint={meta.description}
            onClick={() => onChange(region)}
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
}

function FilterChip({ active, label, count, accent = '#c7d2fe', hint, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
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
