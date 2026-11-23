/**
 * World skin registry. The HUD and the canvas read the same metadata, so a new
 * skin only needs a renderer in `src/worlds/renderers/` plus an entry here.
 */

export const WORLD_THEME_IDS = ['brain', 'galaxy', 'oled-void'] as const;

export type WorldTheme = (typeof WORLD_THEME_IDS)[number];

export interface WorldThemeMeta {
  id: WorldTheme;
  label: string;
  description: string;
  /** CSS background of the stage behind the transparent WebGL canvas. */
  background: string;
  /** Accent used by the HUD while this world is active. */
  swatch: string;
  hud: {
    surface: string;
    border: string;
    accent: string;
  };
}

export const WORLD_THEMES: WorldThemeMeta[] = [
  {
    id: 'brain',
    label: 'Brain',
    description: 'Synaptic fog and glowing regions',
    background:
      'radial-gradient(1200px 900px at 50% 38%, #1c1238 0%, #0c0719 55%, #05030d 100%)',
    swatch: '#a78bfa',
    hud: {
      surface: 'rgba(14, 10, 28, 0.64)',
      border: 'rgba(167, 139, 250, 0.22)',
      accent: '#a78bfa',
    },
  },
  {
    id: 'galaxy',
    label: 'Galaxy',
    description: 'Constellations across deep space',
    background:
      'radial-gradient(1200px 900px at 50% 45%, #0d1435 0%, #060a1c 48%, #01030a 100%)',
    swatch: '#38bdf8',
    hud: {
      surface: 'rgba(5, 12, 30, 0.64)',
      border: 'rgba(56, 189, 248, 0.22)',
      accent: '#38bdf8',
    },
  },
  {
    id: 'oled-void',
    label: 'OLED Void',
    description: 'Pure #000000, wireframe light',
    background: '#000000',
    swatch: '#f8fafc',
    hud: {
      surface: 'rgba(0, 0, 0, 0.78)',
      border: 'rgba(255, 255, 255, 0.16)',
      accent: '#f8fafc',
    },
  },
];

export const DEFAULT_WORLD_THEME: WorldTheme = 'brain';

export function getWorldTheme(id: WorldTheme): WorldThemeMeta {
  return WORLD_THEMES.find((theme) => theme.id === id) ?? WORLD_THEMES[0];
}

export function isWorldTheme(value: string | null): value is WorldTheme {
  return value !== null && (WORLD_THEME_IDS as readonly string[]).includes(value);
}
