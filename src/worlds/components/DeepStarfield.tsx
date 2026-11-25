import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uDpr;

  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aPhase;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    float twinkle = 1.0 + 0.12 * sin(uTime * (0.3 + aPhase * 0.55) + aPhase * 6.283);
    gl_PointSize = clamp(
      uSize * aSize * uDpr * (150.0 / max(10.0, -viewPosition.z)),
      0.8,
      7.0
    );

    vColor = aColor;
    vAlpha = aAlpha * twinkle;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 coord = gl_PointCoord - 0.5;
    float distanceToCenter = length(coord);
    if (distanceToCenter > 0.5) discard;

    float core = exp(-distanceToCenter * distanceToCenter * 34.0);
    float halo = exp(-distanceToCenter * 5.5) * 0.16;
    float alpha = (core + halo) * vAlpha;

    gl_FragColor = vec4(vColor * (0.82 + core * 0.55), alpha);
  }
`;

const PALETTE = ['#f8fbff', '#dbe8f8', '#f6e8cd', '#c7d8ec', '#ffffff'];

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

/** Sparse, color-varied deep-space stars on a distant shell. */
export function DeepStarfield({ count = 5200 }: { count?: number }) {
  const dpr = useThree((state) => state.viewport.dpr);
  const timeRef = useRef(0);

  const geometry = useMemo(() => {
    const random = mulberry32(730201);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const phases = new Float32Array(count);
    const palette = PALETTE.map((value) => new THREE.Color(value));

    for (let index = 0; index < count; index += 1) {
      const azimuth = random() * Math.PI * 2;
      const elevation = Math.acos(2 * random() - 1);
      const radius = 110 + random() * 105;
      positions[index * 3] = Math.sin(elevation) * Math.cos(azimuth) * radius;
      positions[index * 3 + 1] = Math.cos(elevation) * radius;
      positions[index * 3 + 2] = Math.sin(elevation) * Math.sin(azimuth) * radius;

      const color = palette[Math.floor(random() * palette.length)];
      const brightness = 0.55 + random() * 0.45;
      colors[index * 3] = color.r * brightness;
      colors[index * 3 + 1] = color.g * brightness;
      colors[index * 3 + 2] = color.b * brightness;

      sizes[index] = random() > 0.985 ? 1.2 + random() * 1.2 : 0.3 + random() * 0.9;
      alphas[index] = 0.28 + random() * 0.62;
      phases[index] = random();
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    buffer.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    buffer.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    buffer.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    return buffer;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: 1.35 },
          uDpr: { value: dpr },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [dpr],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state, delta) => {
    timeRef.current += delta;
    material.uniforms.uTime.value = timeRef.current;
    material.uniforms.uDpr.value = state.viewport.dpr;
  });

  return (
    <points
      geometry={geometry}
      material={material}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}
