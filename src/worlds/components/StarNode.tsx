import { useMemo, useRef } from 'react';
import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Region } from '../../core/types';

const NO_RAYCAST = () => null;

const VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * A compact stellar point: white-hot core, exponential corona, cross-shaped
 * optical diffraction, and just enough asymmetry/twinkle to feel photographic.
 */
const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uBrightness;
  uniform float uCoreSize;
  uniform float uDim;
  uniform float uHover;
  uniform float uSelected;
  uniform float uEmphasis;
  uniform vec3 uCoreColor;
  uniform vec3 uHaloColor;
  uniform vec3 uRingColor;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float radius = length(p);
    if (radius > 1.0) discard;

    float angle = atan(p.y, p.x);
    float asymmetry = 1.0 + 0.055 * sin(angle * 3.0 + uSeed * 11.0);
    float r = radius / asymmetry;

    float twinkle = 0.9 + 0.1 * sin(uTime * (0.35 + uSeed * 0.5) + uSeed * 31.0);
    float core = exp(-pow(r / (0.075 * uCoreSize), 2.0) * 1.8);
    float inner = exp(-r * 15.0) * 0.5;
    float corona = exp(-r * 6.0) * 0.13 + exp(-r * 2.8) * 0.045;

    // A restrained four-point optical cross rather than a cartoon flare.
    float spikeX = exp(-abs(p.y) * 190.0) * exp(-abs(p.x) * 3.6);
    float spikeY = exp(-abs(p.x) * 190.0) * exp(-abs(p.y) * 3.6);

    // Camera-facing focus rings stay crisp even when the star is pin-sharp.
    float selectedRing =
      exp(-pow((r - 0.56) / 0.008, 2.0)) * uSelected;
    float hoverRing =
      exp(-pow((r - 0.56) / 0.006, 2.0)) * uHover * 0.35;
    float emphasisRing =
      exp(-pow((r - (0.76 + 0.015 * sin(uTime * 2.0 + uSeed * 8.0))) / 0.01, 2.0)) *
      uEmphasis;
    float rings = selectedRing * 0.75 + hoverRing * 0.5 + emphasisRing * 0.55;

    vec3 color = mix(
      uHaloColor,
      uCoreColor,
      clamp(core * 1.4 + inner * 0.8 + 0.12, 0.0, 1.0)
    );
    color = mix(color, vec3(1.0), core * 0.9);
    color += uRingColor * rings;

    float alpha =
      (core * 1.1 + inner * 0.42 + corona * 0.55 + (spikeX + spikeY) * 0.11) *
      uBrightness * twinkle * uDim;
    alpha += rings;

    gl_FragColor = vec4(
      color * (1.0 + core * 2.0 + uHover * 0.35),
      clamp(alpha, 0.0, 1.0)
    );
  }
`;

/** Low-saturation realistic stellar tints, one family per brain region. */
const REGION_STAR: Record<Region, { core: string; halo: string }> = {
  prefrontal: { core: '#fff4e2', halo: '#ffd2a0' },
  parietal: { core: '#eef4ff', halo: '#afc9ee' },
  limbic: { core: '#fff0d8', halo: '#ffc17c' },
  hippocampus: { core: '#f2f8ff', halo: '#c2dbf7' },
};

/** Muted region tints for Galaxy labels and focus rings. */
export const STELLAR_ACCENTS: Record<Region, string> = {
  prefrontal: '#ded0b8',
  parietal: '#c9d6e4',
  limbic: '#dcc3a4',
  hippocampus: '#b9cee3',
};

function hashString(value: string): number {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface StarNodeProps {
  seed: string;
  region: Region;
  accent: string;
  color?: string;
  dimmed: boolean;
  hovered: boolean;
  selected: boolean;
  emphasized: boolean;
}

export function StarNode({
  seed,
  region,
  accent,
  color,
  dimmed,
  hovered,
  selected,
  emphasized,
}: StarNodeProps) {
  const material = useRef<THREE.ShaderMaterial | null>(null);
  const timeRef = useRef(0);

  const look = useMemo(() => {
    const random = mulberry32(hashString(seed));
    const family = REGION_STAR[region];
    const white = new THREE.Color('#ffffff');
    const tint = color ? new THREE.Color(color) : null;
    const coreColor = new THREE.Color(family.core).lerp(
      white,
      0.18 + random() * 0.3,
    );
    if (tint) coreColor.lerp(tint, 0.35);
    const haloColor = new THREE.Color(family.halo).lerp(
      coreColor,
      0.2 + random() * 0.3,
    );
    if (tint) haloColor.lerp(tint, 0.5);
    const ringColor = tint
      ? tint.clone().lerp(white, 0.4)
      : new THREE.Color(accent).lerp(white, 0.55);

    return {
      size: 1.9 + random() * 0.9,
      brightness: 0.78 + random() * 0.55,
      coreSize: 0.78 + random() * 0.52,
      phase: random() * Math.PI * 2,
      coreColor,
      haloColor,
      ringColor,
    };
  }, [accent, color, region, seed]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSeed: { value: hashString(seed) / 4294967296 },
      uBrightness: { value: look.brightness },
      uCoreSize: { value: look.coreSize },
      uDim: { value: dimmed ? 0.16 : 1 },
      uHover: { value: hovered ? 1 : 0 },
      uSelected: { value: selected ? 1 : 0 },
      uEmphasis: { value: emphasized ? 1 : 0 },
      uCoreColor: { value: look.coreColor },
      uHaloColor: { value: look.haloColor },
      uRingColor: { value: look.ringColor },
    }),
    [dimmed, emphasized, hovered, look, seed, selected],
  );

  useFrame((_, delta) => {
    const shader = material.current;
    if (!shader) return;
    timeRef.current += delta;
    shader.uniforms.uTime.value = timeRef.current + look.phase;
    shader.uniforms.uDim.value = THREE.MathUtils.damp(
      shader.uniforms.uDim.value,
      dimmed ? 0.16 : 1,
      8,
      delta,
    );
    shader.uniforms.uHover.value = THREE.MathUtils.damp(
      shader.uniforms.uHover.value,
      hovered ? 1 : 0,
      10,
      delta,
    );
  });

  return (
    <Billboard scale={[look.size, look.size, look.size]}>
      <mesh raycast={NO_RAYCAST} frustumCulled={false} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={(el) => { material.current = el; }}
          uniforms={uniforms}
          vertexShader={VERTEX}
          fragmentShader={FRAGMENT}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </Billboard>
  );
}
