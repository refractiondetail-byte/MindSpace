import { useEffect, useMemo, useRef } from 'react';
import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3 } from '../layout';

const NO_RAYCAST = () => null;

const VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Faint atlas of distant galaxies. Spiral types get two logarithmic arms and
 * soft dust; elliptical types are smooth old stellar populations. All colors
 * are deliberately desaturated.
 */
const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uType;
  uniform float uFlatten;
  uniform float uIntensity;
  uniform vec3 uCore;
  uniform vec3 uHalo;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    if (length(p) > 1.0) discard;

    float c = cos(uSeed * 4.3);
    float s = sin(uSeed * 4.3);
    vec2 q = mat2(c, -s, s, c) * p;
    q.y *= 1.0 + uFlatten;

    float er = length(q);
    if (er > 1.0) discard;

    float angle = atan(q.y, q.x);
    float core = exp(-er * er * 34.0);
    float halo = exp(-er * 5.5) * 0.35;
    float disk = exp(-er * 4.0) * (1.0 - smoothstep(0.62, 0.98, er));

    float phase = angle * 2.0 - log(max(er, 0.035)) * 6.5 + uSeed * 18.0;
    float arms = pow(0.5 + 0.5 * cos(phase), 5.0);
    float cloud = vnoise(
      vec2(cos(angle), sin(angle)) * er * 13.0 +
      uSeed * 20.0 +
      vec2(0.0, uTime * 0.02)
    );
    float spiral = arms * disk * (0.55 + 0.45 * cloud);
    float elliptical = core * 1.3 + halo;
    float shape = mix(spiral + core * 0.85 + halo * 0.15, elliptical, uType);

    vec3 color = mix(uHalo, uCore, clamp(core * 1.4 + spiral, 0.0, 1.0));
    gl_FragColor = vec4(color, shape * uIntensity);
  }
`;

interface GalaxySpec {
  position: Vec3;
  size: number;
  type: 0 | 1;
  flatten: number;
  intensity: number;
  core: string;
  halo: string;
}

const GALAXIES: GalaxySpec[] = [
  {
    position: [-95, 36, -122],
    size: 26,
    type: 0,
    flatten: 0.24,
    intensity: 0.34,
    core: '#fff2dc',
    halo: '#c8b08b',
  },
  {
    position: [82, -26, -138],
    size: 22,
    type: 0,
    flatten: 0.5,
    intensity: 0.3,
    core: '#eef4ff',
    halo: '#93abc9',
  },
  {
    position: [128, 52, -58],
    size: 18,
    type: 1,
    flatten: 0.55,
    intensity: 0.24,
    core: '#f8f2e7',
    halo: '#b6a892',
  },
  {
    position: [-62, 66, -96],
    size: 20,
    type: 0,
    flatten: 0.18,
    intensity: 0.26,
    core: '#f4f8ff',
    halo: '#a4b8d0',
  },
  {
    position: [15, 82, -170],
    size: 30,
    type: 1,
    flatten: 0.38,
    intensity: 0.28,
    core: '#fdf8ee',
    halo: '#c1b49e',
  },
  {
    position: [-138, -8, -24],
    size: 16,
    type: 0,
    flatten: 0.62,
    intensity: 0.22,
    core: '#eef5ff',
    halo: '#8fa6c1',
  },
  {
    position: [96, 70, 30],
    size: 14,
    type: 0,
    flatten: 0.22,
    intensity: 0.2,
    core: '#fff4e0',
    halo: '#c6b28f',
  },
  {
    position: [-42, 104, -150],
    size: 24,
    type: 0,
    flatten: 0.42,
    intensity: 0.25,
    core: '#f6f9ff',
    halo: '#a9bdd4',
  },
];

export function DistantGalaxies() {
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const materials = useMemo(
    () =>
      GALAXIES.map(
        (galaxy, index) =>
          new THREE.ShaderMaterial({
            uniforms: {
              uTime: { value: 0 },
              uSeed: { value: 0.11 + index * 0.127 },
              uType: { value: galaxy.type },
              uFlatten: { value: galaxy.flatten },
              uIntensity: { value: galaxy.intensity },
              uCore: { value: new THREE.Color(galaxy.core) },
              uHalo: { value: new THREE.Color(galaxy.halo) },
            },
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
      ),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      for (const material of materials) material.dispose();
    },
    [geometry, materials],
  );

  const timeRef = useRef(0);
  useFrame((_, delta) => {
    timeRef.current += delta;
    for (const material of materials) {
      material.uniforms.uTime.value = timeRef.current;
    }
  });

  return (
    <>
      {GALAXIES.map((galaxy, index) => (
        <Billboard
          key={`${galaxy.position.join(':')}-${galaxy.size}`}
          position={galaxy.position}
          scale={galaxy.size}
        >
          <mesh
            geometry={geometry}
            material={materials[index]}
            frustumCulled={false}
            raycast={NO_RAYCAST}
          />
        </Billboard>
      ))}
    </>
  );
}
