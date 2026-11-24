import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createCerebellumFoliaGeometry,
  createCerebellumGeometry,
  createCerebrumGeometry,
  createGyrusGeometry,
} from '../geometry/brainGeometry';

const NO_RAYCAST = () => null;

const VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalWorld;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uRim;
  uniform vec3 uDeep;
  uniform float uIntensity;
  uniform float uTime;

  varying vec3 vWorld;
  varying vec3 vNormalWorld;

  void main() {
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 normal = normalize(vNormalWorld);
    float facing = clamp(dot(normal, view), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, 2.4);

    // A quiet breathing shimmer keeps the rim feeling alive, never strobed.
    float shimmer =
      0.9 + 0.1 * sin(vWorld.y * 0.4 + uTime * 0.22 + vWorld.z * 0.18);
    vec3 color = mix(uDeep, uRim, clamp(fresnel * 1.25, 0.0, 1.0));
    float strength = (0.012 + fresnel * 0.36) * uIntensity * shimmer;

    gl_FragColor = vec4(color * strength * 1.7, 1.0);
  }
`;

/**
 * Fleshy, folded cortex. The shell and gyri are smoothly shaded meshes with a
 * light Fresnel rim; the interior stays translucent so neurons and filaments
 * remain legible. No wireframe or hard polygon facets.
 */
export function BrainShell() {
  const cerebrum = useMemo(() => createCerebrumGeometry(), []);
  const cerebellum = useMemo(() => createCerebellumGeometry(), []);
  const gyri = useMemo(() => createGyrusGeometry(), []);
  const folia = useMemo(() => createCerebellumFoliaGeometry(), []);

  const skin = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#5b2c46',
        emissive: '#2b1128',
        emissiveIntensity: 0.55,
        roughness: 0.7,
        metalness: 0.06,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      }),
    [],
  );

  const folds = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#c58ea5',
        emissive: '#5a2347',
        emissiveIntensity: 0.4,
        roughness: 0.5,
        metalness: 0.14,
        transparent: true,
        opacity: 0.66,
        depthWrite: false,
      }),
    [],
  );

  const rim = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uRim: { value: new THREE.Color('#c4a5ff') },
          uDeep: { value: new THREE.Color('#2a1650') },
          uIntensity: { value: 0.85 },
          uTime: { value: 0 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useEffect(
    () => () => {
      cerebrum.dispose();
      cerebellum.dispose();
      gyri.dispose();
      folia.dispose();
      skin.dispose();
      folds.dispose();
      rim.dispose();
    },
    [cerebrum, cerebellum, gyri, folia, skin, folds, rim],
  );

  useFrame((state) => {
    rim.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group>
      <mesh geometry={cerebrum} material={skin} raycast={NO_RAYCAST} />
      <mesh geometry={gyri} material={folds} raycast={NO_RAYCAST} />
      <mesh geometry={cerebellum} material={skin} raycast={NO_RAYCAST} />
      <mesh geometry={folia} material={folds} raycast={NO_RAYCAST} />

      <mesh
        geometry={cerebrum}
        material={rim}
        scale={1.018}
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={cerebellum}
        material={rim}
        scale={1.018}
        raycast={NO_RAYCAST}
      />
    </group>
  );
}
