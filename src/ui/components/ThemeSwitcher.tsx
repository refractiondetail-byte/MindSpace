import { WORLD_THEMES, type WorldTheme } from '../../worlds/themes';

interface ThemeSwitcherProps {
  value: WorldTheme;
  onChange: (theme: WorldTheme) => void;
}

export function ThemeSwitcher({ value, onChange }: ThemeSwitcherProps) {
  return (
    <div className="hud-panel flex items-center gap-0.5 p-1" role="group" aria-label="World theme">
      {WORLD_THEMES.map((theme) => {
        const active = theme.id === value;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => onChange(theme.id)}
            aria-pressed={active}
            title={`${theme.label} — ${theme.description}`}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${
              active
                ? 'bg-white/15 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: theme.swatch,
                boxShadow: active ? `0 0 10px ${theme.swatch}, 0 0 18px ${theme.swatch}` : '0 0 6px rgba(0,0,0,0.6)',
              }}
            />
            <span className="hidden sm:inline">{theme.label}</span>
          </button>
        );
      })}
    </div>
  );
}
