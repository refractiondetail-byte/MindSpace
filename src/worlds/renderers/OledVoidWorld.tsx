import { SceneEdges } from '../components/SceneEdges';
import { SceneNodes } from '../components/SceneNodes';
import { RegionBeacons } from '../components/RegionBeacons';
import type { NodeVisuals, WorldRendererProps } from '../types';

const NODE_VISUALS: NodeVisuals = {
  geometry: 'octahedron',
  detail: 0,
  material: 'basic',
  roughness: 0,
  metalness: 0,
  emissiveIntensity: 0,
  haloOpacity: 0.07,
  haloScale: 1.6,
};

/**
 * Pure #000000 background with unlit wireframe geometry — built for OLED
 * panels where every lit pixel costs power.
 */
export function OledVoidWorld({
  layout,
  selectedId,
  hoveredId,
  activeIds,
  onHover,
  onSelect,
}: WorldRendererProps) {
  return (
    <>
      <RegionBeacons layout={layout} variant="ring" opacity={0.28} />
      <SceneEdges edges={layout.tagEdges} activeIds={activeIds} color="#475569" opacity={0.5} />
      <SceneEdges edges={layout.linkEdges} activeIds={activeIds} opacity={0.65} />
      <SceneNodes
        layout={layout}
        visuals={NODE_VISUALS}
        activeIds={activeIds}
        selectedId={selectedId}
        hoveredId={hoveredId}
        onHover={onHover}
        onSelect={onSelect}
      />
    </>
  );
}
