import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  GALAXY_SHAPE,
  galaxyArmAngle,
  galaxyArmRadius,
} from '../layout';

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

const PALETTE = ['#c6d5e6', '#e7edf6', '#f0dfc4', '#a8bdd4'];

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uDpr;
  uniform float uSpin;

  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float radius = length(position.xz);
    float angle = atan(position.z, position.x);

    // Differential rotation: inner dust laps the outer arms.
    float angular = uSpin / (0.55 + radius * 0.055);
    angle += uTime * angular;

    vec3 spun = vec3(cos(angle) * radius, position.y, sin(angle) * radius);
    vec4 viewPosition = modelViewMatrix * vec4(spun, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    gl_PointSize = clamp(
      uSize * aSize * uDpr * (120.0 / max(3.0, -viewPosition.z)),
      1.0,
      14.0
    );

    vColor = aColor;
    vAlpha = aAlpha;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uOpacity;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 coord = gl_PointCoord - 0.5;
    float distanceToCenter = length(coord);
    if (distanceToCenter > 0.5) discard;

    // Soft radial falloff instead of a hard square point sprite.
    float falloff = smoothstep(0.5, 0.0, distanceToCenter);
    float core = pow(falloff, 2.4);
    float alpha = (core * 0.9 + falloff * 0.12) * uOpacity * vAlpha;

    gl_FragColor = vec4(vColor * (1.0 + core * 0.85), alpha);
  }
`;

/** Faint star dust filling the spiral arms, with soft round glowing grains. */
export function GalaxyDust({
  count = 2400,
  spin = 0.02,
  seed = 20261123,
}: {
  count?: number;
  spin?: number;
  seed?: number;
}) {
  const dpr = useThree((state) => state.viewport.dpr);
  const timeRef = useRef(0);

  const geometry = useMemo(() => {
    const random = mulberry32(seed);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const palette = PALETTE.map((value) => new THREE.Color(value));

    for (let index = 0; index < count; index += 1) {
      let x: number;
      let y: number;
      let z: number;
      let brightness: number;

      if (index % 11 === 0) {
        // Central bulge.
        const theta = random() * Math.PI * 2;
        const radius = Math.pow(random(), 0.6) * 8.5;
        x = Math.cos(theta) * radius;
        z = Math.sin(theta) * radius;
        y = (random() - 0.5) * 3.4;
        brightness = 0.75 + random() * 0.5;
      } else {
        const arm = Math.floor(random() * GALAXY_SHAPE.arms);
        const t = Math.min(1, Math.pow(random(), 0.85));
        const angle = galaxyArmAngle(t, arm) + (random() - 0.5) * 0.22;
        const radius = galaxyArmRadius(t) + (random() - 0.5) * 2.4;
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        y = (random() - 0.5) * GALAXY_SHAPE.thickness * (1 - 0.35 * t);
        brightness = 0.45 + random() * 0.55;
      }

      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;

      const color = palette[Math.floor(random() * palette.length)];
      colors[index * 3] = color.r * brightness;
      colors[index * 3 + 1] = color.g * brightness;
      colors[index * 3 + 2] = color.b * brightness;

      sizes[index] = 0.3 + random() * 0.8;
      alphas[index] = 0.35 + random() * 0.65;
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    buffer.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    buffer.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    return buffer;
  }, [count, seed]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: 1.6 },
          uDpr: { value: dpr },
          uSpin: { value: spin },
          uOpacity: { value: 0.55 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [dpr, spin],
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
