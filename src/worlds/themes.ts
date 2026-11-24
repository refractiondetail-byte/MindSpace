/**
 * World skin registry. The HUD and the canvas read the same metadata, so a new
 * skin only needs a renderer in `src/worlds/renderers/` plus an entry here.
 */

export const WORLD_THEME_IDS = ['galaxy'] as const;

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
    id: 'galaxy',
    label: 'Galaxy',
    description: 'Lensed starlight around a black hole',
    background: '#000000',
    swatch: '#c6d6e8',
    hud: {
      surface: 'rgba(4, 6, 9, 0.68)',
      border: 'rgba(190, 208, 230, 0.18)',
      accent: '#c6d6e8',
    },
  },
];

export const DEFAULT_WORLD_THEME: WorldTheme = 'galaxy';

export function getWorldTheme(id: WorldTheme): WorldThemeMeta {
  return WORLD_THEMES.find((theme) => theme.id === id) ?? WORLD_THEMES[0];
}

export function isWorldTheme(value: string | null): value is WorldTheme {
  return value !== null && (WORLD_THEME_IDS as readonly string[]).includes(value);
}
