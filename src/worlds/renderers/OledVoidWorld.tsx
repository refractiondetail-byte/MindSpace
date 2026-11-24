import { RegionBeacons } from '../components/RegionBeacons';
import { SceneNodes } from '../components/SceneNodes';
import { ScenePaths, type PulseConfig } from '../components/ScenePaths';
import type { NodeVisuals, WorldRendererProps } from '../types';

const NODE_VISUALS: NodeVisuals = {
  variant: 'crisp',
  geometry: 'octahedron',
  detail: 0,
  material: 'basic',
  roughness: 0,
  metalness: 0,
  emissiveIntensity: 0,
  haloOpacity: 0.05,
  haloScale: 1.7,
  outline: 0.55,
  outlineColor: '#f8fafc',
};

const LINK_PULSES: PulseConfig = {
  perEdge: 2,
  size: 1.5,
  speed: 0.2,
  opacity: 0.6,
  variability: 0.45,
};

const TAG_PULSES: PulseConfig = {
  perEdge: 1,
  size: 1.1,
  speed: 0.14,
  opacity: 0.4,
  variability: 0.3,
};

const PROBE_PULSES: PulseConfig = {
  perEdge: 1,
  size: 1,
  speed: 0.09,
  opacity: 0.35,
  variability: 0.4,
  burst: { rate: 0.06, window: 0.05 },
};

/**
 * Pure #000000 background with unlit, high-contrast geometry and clean
 * filaments — built for OLED panels where every lit pixel costs power.
 */
export function OledVoidWorld({
  layout,
  selectedId,
  hoveredId,
  activeIds,
  emphasisIds,
  onHover,
  onSelect,
}: WorldRendererProps) {
  return (
    <>
      <RegionBeacons layout={layout} variant="ring" opacity={0.18} />

      <ScenePaths
        edges={layout.probeEdges}
        activeIds={activeIds}
        selectedId={selectedId}
        color="#334155"
        opacity={0.05}
        pulse={PROBE_PULSES}
      />
      <ScenePaths
        edges={layout.tagEdges}
        activeIds={activeIds}
        selectedId={selectedId}
        color="#475569"
        opacity={0.4}
        pulse={TAG_PULSES}
      />
      <ScenePaths
        edges={layout.linkEdges}
        activeIds={activeIds}
        selectedId={selectedId}
        opacity={0.55}
        additive
        pulse={LINK_PULSES}
      />

      <SceneNodes
        layout={layout}
        visuals={NODE_VISUALS}
        activeIds={activeIds}
        emphasisIds={emphasisIds}
        selectedId={selectedId}
        hoveredId={hoveredId}
        onHover={onHover}
        onSelect={onSelect}
      />
    </>
  );
}
