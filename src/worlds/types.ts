import type { SceneLayout } from './layout';

/** Props every world renderer receives, regardless of skin. */
export interface WorldRendererProps {
  layout: SceneLayout;
  selectedId: string | null;
  hoveredId: string | null;
  /** When set, nodes outside this set are dimmed. */
  activeIds: Set<string> | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

/** Per-skin node styling consumed by the shared node mesh. */
export interface NodeVisuals {
  geometry: 'icosahedron' | 'octahedron' | 'sphere';
  detail: number;
  material: 'standard' | 'basic';
  roughness: number;
  metalness: number;
  emissiveIntensity: number;
  /** 0 disables the additive glow shell. */
  haloOpacity: number;
  haloScale: number;
}
