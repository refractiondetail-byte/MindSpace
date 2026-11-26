import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildDeepStarfieldData, type DeepStarfieldData } from './deepStarData';

/** Original framing for callers that do not share a prebuilt field. */
const DEFAULT_FIELD = { count: 5200, innerRadius: 110, depth: 105 } as const;

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

/** Sparse, color-varied deep-space stars on a distant shell. */
export function DeepStarfield({ data }: { data?: DeepStarfieldData }) {
  const dpr = useThree((state) => state.viewport.dpr);
  const timeRef = useRef(0);

  const fallback = useMemo(
    () =>
      data
        ? null
        : buildDeepStarfieldData(DEFAULT_FIELD.count, DEFAULT_FIELD.innerRadius, DEFAULT_FIELD.depth),
    [data],
  );
  const field = data ?? (fallback as DeepStarfieldData);

  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(field.positions, 3));
    buffer.setAttribute('aColor', new THREE.BufferAttribute(field.colors, 3));
    buffer.setAttribute('aSize', new THREE.BufferAttribute(field.sizes, 1));
    buffer.setAttribute('aAlpha', new THREE.BufferAttribute(field.alphas, 1));
    buffer.setAttribute('aPhase', new THREE.BufferAttribute(field.phases, 1));
    return buffer;
  }, [field]);

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
