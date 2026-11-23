import { Sparkles } from '@react-three/drei';
import { SceneEdges } from '../components/SceneEdges';
import { SceneNodes } from '../components/SceneNodes';
import { RegionBeacons } from '../components/RegionBeacons';
import type { NodeVisuals, WorldRendererProps } from '../types';

const NODE_VISUALS: NodeVisuals = {
  geometry: 'icosahedron',
  detail: 1,
  material: 'standard',
  roughness: 0.38,
  metalness: 0.15,
  emissiveIntensity: 1.15,
  haloOpacity: 0.1,
  haloScale: 1.9,
};

/** Organic synaptic fog: soft lit cells inside wireframe region shells. */
export function BrainWorld({
  layout,
  selectedId,
  hoveredId,
  activeIds,
  onHover,
  onSelect,
}: WorldRendererProps) {
  return (
    <>
      <fog attach="fog" args={['#0a0618', 42, 132]} />
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#ddd6fe', '#1e1b4b', 0.55]} />
      <directionalLight position={[14, 24, 16]} intensity={1.25} color="#ede9fe" />
      <pointLight position={[-20, 4, 8]} intensity={160} distance={64} color="#fb7185" />
      <pointLight position={[20, -2, 10]} intensity={140} distance={60} color="#38bdf8" />

      <Sparkles
        count={90}
        scale={[64, 48, 64]}
        size={1.7}
        speed={0.22}
        opacity={0.35}
        color="#c4b5fd"
      />

      <RegionBeacons layout={layout} variant="shell" opacity={0.22} />
      <SceneEdges edges={layout.tagEdges} activeIds={activeIds} color="#8b7fb8" opacity={0.16} />
      <SceneEdges edges={layout.linkEdges} activeIds={activeIds} opacity={0.5} />
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
