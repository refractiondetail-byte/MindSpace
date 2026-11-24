import type { ComponentType } from 'react';
import { GalaxyWorld } from './renderers/GalaxyWorld';
import type { WorldTheme } from './themes';
import type { WorldRendererProps } from './types';

/**
 * Skin registry. The app now runs strictly in the Galaxy world.
 */
export const WORLD_RENDERERS: Record<WorldTheme, ComponentType<WorldRendererProps>> = {
  galaxy: GalaxyWorld,
};

export type { WorldRendererProps };
