import type { SceneLayout } from './layout';
import type { Region } from '../core/types';

/** Props every world renderer receives, regardless of skin. */
export interface WorldRendererProps {
  layout: SceneLayout;
  clusterNames?: Record<Region, string>;
  selectedId: string | null;
  hoveredId: string | null;
  /** When set, nodes outside this set are dimmed. */
  activeIds: Set<string> | null;
  /** Top live-search matches, marked with a pulsing ring. */
  emphasisIds: Set<string> | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onSelectBlackHole?: () => void;
  homeMode?: boolean;
}

/** Per-skin node body style: neuron, billboard star, or crisp shape. */
export type NodeVariant = 'neuron' | 'star' | 'crisp';

/** Per-skin node styling consumed by the shared node mesh. */
export interface NodeVisuals {
  variant: NodeVariant;
  geometry: 'icosahedron' | 'octahedron' | 'sphere';
  detail: number;
  material: 'standard' | 'basic';
  roughness: number;
  metalness: number;
  emissiveIntensity: number;
  /** 0 disables the additive glow shell. */
  haloOpacity: number;
  haloScale: number;
  /** Opacity of the crisp wireframe outline; 0 disables it. */
  outline: number;
  outlineColor?: string;
}
