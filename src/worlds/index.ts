import type { ComponentType } from 'react';
import { BrainWorld } from './renderers/BrainWorld';
import { GalaxyWorld } from './renderers/GalaxyWorld';
import { OledVoidWorld } from './renderers/OledVoidWorld';
import type { WorldTheme } from './themes';
import type { WorldRendererProps } from './types';

/**
 * Skin registry. Adding a world means adding one renderer here — the shared
 * mechanics (layout, edges, camera, selection) come for free.
 */
export const WORLD_RENDERERS: Record<WorldTheme, ComponentType<WorldRendererProps>> = {
  brain: BrainWorld,
  galaxy: GalaxyWorld,
  'oled-void': OledVoidWorld,
};

export type { WorldRendererProps };
