import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { BlackHole } from '../components/BlackHole';
import { DeepStarfield } from '../components/DeepStarfield';
import { DistantGalaxies } from '../components/DistantGalaxies';
import { GalaxyDust } from '../components/GalaxyDust';
import { OrbitalArcs, ShootingStars } from '../components/GalaxyMotion';
import { RegionBeacons } from '../components/RegionBeacons';
import { SceneNodes } from '../components/SceneNodes';
import { ScenePaths, type PulseConfig } from '../components/ScenePaths';
import type { NodeVisuals, WorldRendererProps } from '../types';

const NODE_VISUALS: NodeVisuals = {
  variant: 'star',
  geometry: 'sphere',
  detail: 1,
  material: 'basic',
  roughness: 0,
  metalness: 0,
  emissiveIntensity: 0,
  haloOpacity: 0,
  haloScale: 1,
  outline: 0,
};

const TAG_PULSES: PulseConfig = {
  perEdge: 2,
  size: 1.35,
  speed: 0.2,
  opacity: 0.52,
  variability: 0.8,
};

const PROBE_PULSES: PulseConfig = {
  perEdge: 2,
  size: 1.15,
  speed: 0.13,
  opacity: 0.4,
  variability: 1,
  burst: { rate: 0.13, window: 0.1 },
};

/**
 * Four logarithmic spiral arms, one per region, sweeping around a black hole.
 * Dust orbits differentially and the starfield turns slowly, so the galaxy
 * keeps moving without pulling thoughts out from under the camera.
 */
export function GalaxyWorld({
  layout,
  clusterNames,
  onSelectBlackHole,
  selectedId,
  hoveredId,
  activeIds,
  emphasisIds,
  homeMode = false,
  onHover,
  onSelect,
}: WorldRendererProps) {
  const starfield = useRef<Group>(null);

  useFrame((_, delta) => {
    if (starfield.current) starfield.current.rotation.y += delta * 0.004;
  });

  return (
    <>
      <fog attach="fog" args={['#000000', 110, 240]} />

      <group ref={starfield}>
        <DeepStarfield />
        <DistantGalaxies />
      </group>

      <GalaxyDust count={3600} spin={0.02} seed={20261123} />
      <GalaxyDust count={1800} spin={0.012} seed={917351} />
      <OrbitalArcs />
      <ShootingStars />
      <BlackHole onSelect={onSelectBlackHole} />
      <RegionBeacons
        layout={layout}
        clusterNames={clusterNames}
        variant="label"
        opacity={0.55}
        tone="stellar"
        blur={homeMode}
      />

      <ScenePaths
        edges={layout.probeEdges}
        activeIds={activeIds}
        selectedId={selectedId}
        color="#8fa6bd"
        opacity={0.1}
        additive
        pulse={PROBE_PULSES}
      />
      <ScenePaths
        edges={layout.tagEdges}
        activeIds={activeIds}
        selectedId={selectedId}
        color="#b3c1d1"
        opacity={0.2}
        additive
        pulse={TAG_PULSES}
      />
      <ScenePaths
        edges={layout.linkEdges}
        activeIds={activeIds}
        selectedId={selectedId}
        color="#8b93a7"
        opacity={0.12}
        additive
        pulse={null}
      />

      <SceneNodes
        layout={layout}
        clusterNames={clusterNames}
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
