import { Stars } from '@react-three/drei';
import { SceneEdges } from '../components/SceneEdges';
import { SceneNodes } from '../components/SceneNodes';
import { RegionBeacons } from '../components/RegionBeacons';
import type { NodeVisuals, WorldRendererProps } from '../types';

const NODE_VISUALS: NodeVisuals = {
  geometry: 'sphere',
  detail: 1,
  material: 'standard',
  roughness: 0.3,
  metalness: 0.1,
  emissiveIntensity: 1.7,
  haloOpacity: 0.2,
  haloScale: 2.5,
};

/** Deep-space constellations: glowing stars joined by additive light. */
export function GalaxyWorld({
  layout,
  selectedId,
  hoveredId,
  activeIds,
  onHover,
  onSelect,
}: WorldRendererProps) {
  return (
    <>
      <fog attach="fog" args={['#05070f', 62, 170]} />
      <ambientLight intensity={0.28} />
      <directionalLight position={[10, 18, 12]} intensity={0.7} color="#bae6fd" />
      <pointLight position={[0, 2, -1]} intensity={220} distance={90} color="#7dd3fc" />

      <Stars radius={150} depth={70} count={4800} factor={4.2} saturation={0} fade speed={0.6} />

      <RegionBeacons layout={layout} variant="ring" opacity={0.35} />
      <SceneEdges
        edges={layout.tagEdges}
        activeIds={activeIds}
        color="#64748b"
        opacity={0.3}
        additive
      />
      <SceneEdges edges={layout.linkEdges} activeIds={activeIds} opacity={0.75} additive />
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
