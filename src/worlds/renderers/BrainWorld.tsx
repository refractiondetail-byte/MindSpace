import { Sparkles } from '@react-three/drei';
import { REGION_META } from '../../core/types';
import { BrainShell } from '../components/BrainShell';
import { RegionBeacons } from '../components/RegionBeacons';
import { SceneNodes } from '../components/SceneNodes';
import { ScenePaths, type PulseConfig } from '../components/ScenePaths';
import type { NodeVisuals, WorldRendererProps } from '../types';

const NODE_VISUALS: NodeVisuals = {
  variant: 'neuron',
  geometry: 'sphere',
  detail: 1,
  material: 'standard',
  roughness: 0.38,
  metalness: 0.16,
  emissiveIntensity: 1.5,
  haloOpacity: 0.16,
  haloScale: 1.9,
  outline: 0,
};

const LINK_PULSES: PulseConfig = {
  perEdge: 3,
  size: 2.4,
  speed: 0.3,
  opacity: 1,
  variability: 0.85,
};

const TAG_PULSES: PulseConfig = {
  perEdge: 2,
  size: 1.7,
  speed: 0.21,
  opacity: 0.62,
  variability: 0.8,
};

/** Nearby connections spark briefly, as if the brain were testing them. */
const PROBE_PULSES: PulseConfig = {
  perEdge: 2,
  size: 1.3,
  speed: 0.13,
  opacity: 0.55,
  variability: 1,
  burst: { rate: 0.16, window: 0.09 },
};

/** Organic synaptic fog: glowing thoughts firing inside a sculpted brain. */
export function BrainWorld({
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
      <fog attach="fog" args={['#08050f', 70, 160]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#ddd6fe', '#1e1b4b', 0.55]} />
      <directionalLight position={[14, 24, 16]} intensity={1.2} color="#ede9fe" />

      {layout.regions.map(({ region, center }) => (
        <pointLight
          key={region}
          position={center}
          intensity={30}
          distance={16}
          decay={2}
          color={REGION_META[region].accent}
        />
      ))}

      <Sparkles
        count={70}
        scale={[55, 42, 60]}
        size={1.5}
        speed={0.2}
        opacity={0.3}
        color="#c4b5fd"
      />

      <BrainShell />
      <RegionBeacons layout={layout} variant="label" opacity={0.6} />

      <ScenePaths
        edges={layout.probeEdges}
        activeIds={activeIds}
        selectedId={selectedId}
        color="#8b7fb8"
        opacity={0.09}
        additive
        pulse={PROBE_PULSES}
      />
      <ScenePaths
        edges={layout.tagEdges}
        activeIds={activeIds}
        selectedId={selectedId}
        color="#9d8ec7"
        opacity={0.2}
        additive
        pulse={TAG_PULSES}
      />
      <ScenePaths
        edges={layout.linkEdges}
        activeIds={activeIds}
        selectedId={selectedId}
        opacity={0.5}
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
