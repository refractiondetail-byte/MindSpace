import { WORLD_THEMES } from '../../worlds/themes';

interface TogglePillProps {
  value: 'world' | 'home';
  onChange: (value: 'world' | 'home') => void;
  localOnly?: boolean;
}

export function TogglePill({ value, onChange, localOnly }: TogglePillProps) {
  return (
    <div
      className="hud-panel flex items-center gap-0.5 p-1"
      role="group"
      aria-label="View mode"
    >
      <button
        type="button"
        onClick={() => onChange('world')}
        aria-pressed={value === 'world'}
        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
          value === 'world'
            ? 'bg-white/15 text-white'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <span
          className="inline-block mr-1.5 h-2 w-2 rounded-full"
          style={{
            backgroundColor:
              value === 'world'
                ? WORLD_THEMES.find((theme) => theme.id === 'galaxy')?.swatch ??
                  '#c6d6e8'
                : 'rgba(255,255,255,0.25)',
            boxShadow: value === 'world'
              ? '0 0 10px rgba(198,214,232,0.9), 0 0 18px rgba(198,214,232,0.5)'
              : undefined,
          }}
          aria-hidden="true"
        />
        Pages
      </button>
      <button
        type="button"
        onClick={() => onChange('home')}
        aria-pressed={value === 'home'}
        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
          value === 'home'
            ? 'bg-white/15 text-white'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <span
          className="inline-block mr-1.5 h-2 w-2 rounded-full"
          style={{
            backgroundColor:
              value === 'home'
                ? '#6ee7b7'
                : 'rgba(255,255,255,0.25)',
            boxShadow: value === 'home'
              ? '0 0 10px rgba(110,231,183,0.9), 0 0 18px rgba(110,231,183,0.5)'
              : undefined,
          }}
          aria-hidden="true"
        />
        Home
      </button>
      {localOnly && (
        <span className="ml-1 text-[9px] text-slate-500" aria-label="local only">
          local
        </span>
      )}
    </div>
  );
}
