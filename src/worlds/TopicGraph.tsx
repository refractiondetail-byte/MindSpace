import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { CameraController, type CameraFocus } from './components/CameraController';
import * as THREE from 'three';
import type { MindItem } from '../ui/types';
import type { Region } from '../core/types';
import { StarNode } from './components/StarNode';
import { DeepStarfield } from './components/DeepStarfield';
import { BlackHole } from './components/BlackHole';
import { MilkyWay, milkyWayArmPoint } from './components/MilkyWay';

interface Cluster {
  name: string;
  color: string;
  region: Region;
  items: MindItem[];
  center: [number, number, number];
}

interface GraphEdge {
  fromId: string;
  toId: string;
  color: string;
}

function hashValue(value: string): number {
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

const NO_RAYCAST = () => null;

const PLANET_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uMountain;
  varying vec3 vPosition;
  varying float vHeight;
  varying vec3 vNormal;

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash31(i);
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
    float nx00 = mix(n000, n100, u.x);
    float nx01 = mix(n001, n101, u.x);
    float nx10 = mix(n010, n110, u.x);
    float nx11 = mix(n011, n111, u.x);
    float nxy0 = mix(nx00, nx10, u.y);
    float nxy1 = mix(nx01, nx11, u.y);
    return mix(nxy0, nxy1, u.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i += 1) {
      value += amplitude * vnoise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 p = position;
    float height = 0.0;
    if (uMountain > 0.5) {
      height = fbm(p * (2.2 + uSeed * 2.0) + uTime * 0.05);
      p += normal * height * 0.22;
    }
    vHeight = height;
    vPosition = p;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const PLANET_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uMountain;
  uniform float uHover;
  uniform float uSelected;
  varying vec3 vPosition;
  varying float vHeight;
  varying vec3 vNormal;

  void main() {
    float bands = 0.5 + 0.5 * sin(vPosition.y * 9.0 + vHeight * 6.0);
    vec3 base = uColor;
    if (uMountain > 0.5) {
      base = mix(base * 0.7, base * 1.35, smoothstep(-0.1, 0.5, vHeight));
      float shade = 0.55 + 0.45 * clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
      base *= shade;
    } else {
      base = mix(base * 0.85, base * 1.15, bands);
    }
    float focus = 1.0 + uHover * 0.4 + uSelected * 0.7;
    gl_FragColor = vec4(base * focus, 1.0);
  }
`;

const PULSE_VERTEX = /* glsl */ `
  uniform float uDpr;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    // Fixed world size: only brightness animates, so the glow never "pops".
    gl_PointSize = clamp(aSize * uDpr * (90.0 / max(6.0, -viewPosition.z)), 0.0, 48.0);
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;

const PULSE_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.001) discard;
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    // Gaussian falloff: a soft bloom with a hot core, no hard sprite edge.
    float halo = exp(-d * d * 5.0) - exp(-5.0);
    float core = exp(-d * d * 38.0);
    float alpha = (halo * 0.5 + core) * vAlpha;
    vec3 color = mix(vColor, vec3(1.0), core * 0.7);
    gl_FragColor = vec4(color, alpha);
  }
`;

function TopicHub({
  cluster,
  registerRef,
}: {
  cluster: Cluster;
  registerRef: (id: string, obj: THREE.Object3D | null) => void;
}) {
  const ref = useRef<THREE.Group>(null);

  useEffect(() => {
    if (ref.current) registerRef(`topic:${cluster.name}`, ref.current);
    return () => registerRef(`topic:${cluster.name}`, null);
  }, [cluster.name, registerRef]);

  return (
    <group ref={ref} position={cluster.center}>
      <StarNode
        seed={cluster.name}
        region={cluster.region}
        accent={cluster.color}
        color={cluster.color}
        dimmed={false}
        hovered={false}
        selected={false}
        emphasized={false}
      />
      <Html position={[0, 2.4, 0]} center style={{ pointerEvents: 'none' }}>
        <span style={{ color: cluster.color, fontSize: 11, fontWeight: 600 }}>
          {cluster.name}
        </span>
      </Html>
    </group>
  );
}

function Moon({ seed }: { seed: string }) {
  const ref = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  const params = useMemo(() => {
    const random = mulberry32(hashValue(seed));
    return {
      a: 0.35 + random() * 0.25,
      b: (0.35 + random() * 0.25) * (0.6 + random() * 0.3),
      tilt: (random() - 0.5) * 1.2,
      speed: 0.6 + random() * 0.8,
      phase: random() * Math.PI * 2,
    };
  }, [seed]);

  useFrame((_, delta) => {
    timeRef.current += delta;
    const t = timeRef.current * params.speed + params.phase;
    const x = params.a * Math.cos(t);
    const z = params.b * Math.sin(t);
    const y = Math.sin(t * 2.0) * 0.05;
    const cos = Math.cos(params.tilt);
    const sin = Math.sin(params.tilt);
    const y1 = y * cos - z * sin;
    const z1 = y * sin + z * cos;
    if (ref.current) ref.current.position.set(x, y1, z1);
  });

  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial color="#cbd5e1" toneMapped={false} />
      </mesh>
    </group>
  );
}

function Planet({
  item,
  clusterCenter,
  nodeRefs,
  registerRef,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  item: MindItem;
  clusterCenter: [number, number, number];
  nodeRefs: { current: Map<string, THREE.Object3D> };
  registerRef: (id: string, obj: THREE.Object3D | null) => void;
  selected: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const orbitGroupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<any>(null);
  const timeRef = useRef(0);

  const params = useMemo(() => {
    const random = mulberry32(hashValue(item.id));
    const a = 7.0 + random() * 7.0;
    const b = a * (0.78 + random() * 0.20);
    const tiltX = (random() - 0.5) * 0.9;
    const tiltZ = (random() - 0.5) * 0.9;
    const yaw = random() * Math.PI * 2;
    const speed = 0.06 + random() * 0.12;
    const phase = random() * Math.PI * 2;
    const size =
      item.entryType === 'attachment'
        ? 0.05 + random() * 0.05
        : 0.08 + random() * 0.10;
    const mountain = random() > 0.45;
    const moonCount = random() < 0.35 ? 1 + Math.floor(random() * 2) : 0;
    const moonSeeds = Array.from(
      { length: moonCount },
      (_, index) => `${item.id}:moon:${index}`,
    );
    return { a, b, tiltX, tiltZ, yaw, speed, phase, size, mountain, moonSeeds };
  }, [item.id, item.entryType]);

  const orbitGeometry = useMemo(() => {
    const segments = 96;
    const positions = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i += 1) {
      const t = (i / segments) * Math.PI * 2;
      const x = params.a * Math.cos(t);
      const z = params.b * Math.sin(t);
      const y = Math.sin(t * 2.0) * 0.2;
      const cyaw = Math.cos(params.yaw);
      const syaw = Math.sin(params.yaw);
      const xr = x * cyaw - z * syaw;
      const zr = x * syaw + z * cyaw;
      const cosX = Math.cos(params.tiltX);
      const sinX = Math.sin(params.tiltX);
      const y1 = y * cosX - zr * sinX;
      const z1 = y * sinX + zr * cosX;
      const cosZ = Math.cos(params.tiltZ);
      const sinZ = Math.sin(params.tiltZ);
      const x2 = xr * cosZ - y1 * sinZ;
      const y2 = xr * sinZ + y1 * cosZ;
      positions[i * 3] = x2;
      positions[i * 3 + 1] = y2;
      positions[i * 3 + 2] = z1;
    }
    positions[segments * 3] = positions[0];
    positions[segments * 3 + 1] = positions[1];
    positions[segments * 3 + 2] = positions[2];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [params.a, params.b, params.tiltX, params.tiltZ, params.yaw]);

  useEffect(() => () => orbitGeometry.dispose(), [orbitGeometry]);

  const orbitLine = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: item.topicColor || '#94a3b8',
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const line = new THREE.LineLoop(orbitGeometry, material);
    (line as any).raycast = NO_RAYCAST;
    return line;
  }, [orbitGeometry, item.topicColor]);

  useEffect(() => {
    const material = orbitLine.material as THREE.LineBasicMaterial;
    material.opacity = hovered || selected ? 0.45 : 0.14;
  }, [hovered, selected, orbitLine]);

  useEffect(() => () => {
    (orbitLine.material as THREE.Material).dispose();
  }, [orbitLine]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSeed: { value: hashValue(item.id) / 4294967296 },
      uColor: { value: new THREE.Color(item.topicColor || '#94a3b8') },
      uMountain: { value: params.mountain ? 1 : 0 },
      uHover: { value: 0 },
      uSelected: { value: 0 },
    }),
    [item.id, item.topicColor, params.mountain],
  );

  useEffect(() => {
    if (groupRef.current) registerRef(item.id, groupRef.current);
    return () => registerRef(item.id, null);
  }, [item.id, registerRef]);

  useFrame((_, delta) => {
    timeRef.current += delta;

    let cx = clusterCenter[0];
    let cy = clusterCenter[1];
    let cz = clusterCenter[2];
    if (item.entryType === 'attachment' && item.parentId) {
      const parent = nodeRefs.current.get(item.parentId)?.position;
      if (parent) {
        cx = parent.x;
        cy = parent.y;
        cz = parent.z;
      }
    }

    const t = timeRef.current * params.speed + params.phase;
    const x = params.a * Math.cos(t);
    const z = params.b * Math.sin(t);
    const y = Math.sin(t * 2.0) * 0.2;

    const cyaw = Math.cos(params.yaw);
    const syaw = Math.sin(params.yaw);
    const xr = x * cyaw - z * syaw;
    const zr = x * syaw + z * cyaw;

    const cosX = Math.cos(params.tiltX);
    const sinX = Math.sin(params.tiltX);
    const y1 = y * cosX - zr * sinX;
    const z1 = y * sinX + zr * cosX;

    const cosZ = Math.cos(params.tiltZ);
    const sinZ = Math.sin(params.tiltZ);
    const x2 = xr * cosZ - y1 * sinZ;
    const y2 = xr * sinZ + y1 * cosZ;

    if (groupRef.current) {
      groupRef.current.position.set(cx + x2, cy + y2, cz + z1);
    }
    if (orbitGroupRef.current) {
      orbitGroupRef.current.position.set(cx, cy, cz);
    }

    const material = materialRef.current;
    if (material) {
      material.uniforms.uTime.value = timeRef.current;
      material.uniforms.uHover.value = THREE.MathUtils.damp(
        material.uniforms.uHover.value,
        hovered ? 1 : 0,
        10,
        delta,
      );
      material.uniforms.uSelected.value = THREE.MathUtils.damp(
        material.uniforms.uSelected.value,
        selected ? 1 : 0,
        10,
        delta,
      );
    }

    const mesh = meshRef.current;
    if (mesh) {
      const targetScale = params.size * (selected ? 1.6 : hovered ? 1.25 : 1);
      const next = THREE.MathUtils.damp(mesh.scale.x, targetScale, 9, delta);
      mesh.scale.setScalar(next);
    }
  });

  return (
    <>
      <group ref={orbitGroupRef}>
        <primitive object={orbitLine} />
      </group>
      <group ref={groupRef}>
        <mesh
        ref={meshRef}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(item.id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(item.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = '';
        }}
      >
        <sphereGeometry args={[1, 32, 32]} />
        <shaderMaterial
          ref={(el) => {
            materialRef.current = el;
          }}
          uniforms={uniforms}
          vertexShader={PLANET_VERTEX}
          fragmentShader={PLANET_FRAGMENT}
        />
      </mesh>
      {params.moonSeeds.map((seed) => (
        <Moon key={seed} seed={seed} />
      ))}
      {(hovered || selected) && (
        <Html position={[0, params.size + 0.6, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="hud-panel w-max max-w-[14rem] px-2.5 py-1.5 text-left">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {item.topic || 'Untagged'}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug text-white">
              {item.title}
            </p>
          </div>
        </Html>
      )}
      </group>
    </>
  );
}

interface AmbientPlanetSpec {
  a: number;
  b: number;
  tiltX: number;
  tiltZ: number;
  yaw: number;
  speed: number;
  phase: number;
  size: number;
}

interface AmbientStarSpec {
  position: [number, number, number];
  color: string;
  planets: AmbientPlanetSpec[];
}

function ambientOrbitGeometry(params: AmbientPlanetSpec): THREE.BufferGeometry {
  const segments = 80;
  const positions = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    const x = params.a * Math.cos(t);
    const z = params.b * Math.sin(t);
    const y = Math.sin(t * 2.0) * 0.15;
    const cyaw = Math.cos(params.yaw);
    const syaw = Math.sin(params.yaw);
    const xr = x * cyaw - z * syaw;
    const zr = x * syaw + z * cyaw;
    const cosX = Math.cos(params.tiltX);
    const sinX = Math.sin(params.tiltX);
    const y1 = y * cosX - zr * sinX;
    const z1 = y * sinX + zr * cosX;
    const cosZ = Math.cos(params.tiltZ);
    const sinZ = Math.sin(params.tiltZ);
    const x2 = xr * cosZ - y1 * sinZ;
    const y2 = xr * sinZ + y1 * cosZ;
    positions[i * 3] = x2;
    positions[i * 3 + 1] = y2;
    positions[i * 3 + 2] = z1;
  }
  positions[segments * 3] = positions[0];
  positions[segments * 3 + 1] = positions[1];
  positions[segments * 3 + 2] = positions[2];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function AmbientStar({ spec }: { spec: AmbientStarSpec }) {
  const planetRefs = useRef<Array<THREE.Group | null>>([]);
  const timeRef = useRef(0);
  const orbits = useMemo(() => spec.planets.map((planet) => ambientOrbitGeometry(planet)), [spec.planets]);
  const orbitLines = useMemo(
    () =>
      orbits.map(
        (geometry) =>
          new THREE.LineLoop(
            geometry,
            new THREE.LineBasicMaterial({
              color: spec.color,
              transparent: true,
              opacity: 0.07,
              depthWrite: false,
              toneMapped: false,
            }),
          ),
      ),
    [orbits, spec.color],
  );

  useEffect(() => () => orbits.forEach((geometry) => geometry.dispose()), [orbits]);
  useEffect(() => () => orbitLines.forEach((line) => (line.material as THREE.Material).dispose()), [orbitLines]);

  useFrame((_, delta) => {
    timeRef.current += delta;
    spec.planets.forEach((planet, index) => {
      const ref = planetRefs.current[index];
      if (!ref) return;
      const t = timeRef.current * planet.speed + planet.phase;
      const x = planet.a * Math.cos(t);
      const z = planet.b * Math.sin(t);
      const y = Math.sin(t * 2.0) * 0.15;
      const cyaw = Math.cos(planet.yaw);
      const syaw = Math.sin(planet.yaw);
      const xr = x * cyaw - z * syaw;
      const zr = x * syaw + z * cyaw;
      const cosX = Math.cos(planet.tiltX);
      const sinX = Math.sin(planet.tiltX);
      const y1 = y * cosX - zr * sinX;
      const z1 = y * sinX + zr * cosX;
      const cosZ = Math.cos(planet.tiltZ);
      const sinZ = Math.sin(planet.tiltZ);
      const x2 = xr * cosZ - y1 * sinZ;
      const y2 = xr * sinZ + y1 * cosZ;
      ref.position.set(x2, y2, z1);
    });
  });

  return (
    <group position={spec.position}>
      <group scale={0.62}>
        <StarNode
          seed={`ambient:${spec.position.join(':')}`}
          region="parietal"
          accent={spec.color}
          color={spec.color}
          dimmed={false}
          hovered={false}
          selected={false}
          emphasized={false}
        />
      </group>
      {spec.planets.map((planet, index) => (
        <group key={`ambient-planet-${index}`}>
          <primitive object={orbitLines[index]} />
          <group ref={(el) => { planetRefs.current[index] = el; }}>
            <mesh raycast={NO_RAYCAST}>
              <sphereGeometry args={[planet.size, 8, 8]} />
              <meshBasicMaterial color="#cbd5e1" transparent opacity={0.45} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

/** Samples per curved filament. */
const CURVE_SEGMENTS = 40;
/** How far past the target the head travels so its tail drains in smoothly. */
const PULSE_OVERSHOOT = 0.3;
/** Dim resting brightness of a filament (additive). */
const FILAMENT_BASE = 0.13;

interface CurveDef {
  /** Sideways bow, as a fraction of chord length (signed). */
  bend: number;
  /** Vertical arc, as a fraction of chord length (signed). */
  lift: number;
}

interface PulseDef {
  edgeIndex: number;
  speed: number;
  offset: number;
  cycle: number;
  strength: number;
  size: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Brightness contribution of a pulse head at `head` to a point at `s` (both 0-1 along the curve). */
function pulseShape(s: number, head: number): number {
  const d = s - head;
  if (d > 0) {
    // Leading edge: tight gaussian.
    const x = d / 0.022;
    return Math.exp(-x * x);
  }
  // Trailing light: long exponential tail like a comet.
  return Math.exp(d / 0.085);
}

function DynamicEdges({
  edges,
  nodeRefs,
}: {
  edges: GraphEdge[];
  nodeRefs: { current: Map<string, THREE.Object3D> };
}) {
  const timeRef = useRef(0);

  const skeletonRef = useRef<THREE.Vector3[]>([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);

  const pulseMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uDpr: { value: 1 } },
        vertexShader: PULSE_VERTEX,
        fragmentShader: PULSE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useEffect(() => () => pulseMaterial.dispose(), [pulseMaterial]);

  const curves = useMemo<CurveDef[]>(
    () =>
      edges.map((edge) => {
        const random = mulberry32(hashValue(`${edge.fromId}->${edge.toId}:curve`));
        const side = random() > 0.5 ? 1 : -1;
        return {
          bend: side * (0.18 + random() * 0.26),
          lift: (random() - 0.35) * 0.4,
        };
      }),
    [edges],
  );

  const pulseDefs = useMemo<PulseDef[]>(() => {
    const defs: PulseDef[] = [];
    edges.forEach((edge, edgeIndex) => {
      const random = mulberry32(hashValue(`${edge.fromId}->${edge.toId}:pulse`));
      const count = random() < 0.35 ? 2 : 1;
      for (let index = 0; index < count; index += 1) {
        // Each cycle = travel (1 + overshoot) plus a resting gap with no light.
        const cycle = 1 + PULSE_OVERSHOOT + 0.4 + random() * 1.6;
        defs.push({
          edgeIndex,
          speed: 0.09 + random() * 0.07,
          offset: (index / count) * cycle + random() * 0.5,
          cycle,
          strength: 0.65 + random() * 0.35,
          size: 1.6 + random() * 0.9,
        });
      }
    });
    return defs;
  }, [edges]);

  const pulsesByEdge = useMemo(() => {
    const map: number[][] = edges.map(() => []);
    pulseDefs.forEach((pulse, index) => map[pulse.edgeIndex].push(index));
    return map;
  }, [edges, pulseDefs]);

  const baseColors = useMemo(
    () => edges.map((edge) => new THREE.Color(edge.color || '#94a3b8')),
    [edges],
  );

  const lineGeometry = useMemo(() => {
    const vertexCount = Math.max(1, edges.length) * CURVE_SEGMENTS * 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage),
    );
    return geometry;
  }, [edges]);
  useEffect(() => () => lineGeometry.dispose(), [lineGeometry]);

  const pulseGeometry = useMemo(() => {
    const count = Math.max(1, pulseDefs.length);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    pulseDefs.forEach((pulse, index) => {
      const color = baseColors[pulse.edgeIndex].clone().lerp(new THREE.Color('#ffffff'), 0.35);
      colors.set([color.r, color.g, color.b], index * 3);
      sizes[index] = pulse.size;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute(
      'aAlpha',
      new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage),
    );
    return geometry;
  }, [pulseDefs, baseColors]);
  useEffect(() => () => pulseGeometry.dispose(), [pulseGeometry]);

  // Scratch buffers reused every frame.
  const scratch = useMemo(
    () => ({
      points: new Float32Array((CURVE_SEGMENTS + 1) * 3),
      glow: new Float32Array(CURVE_SEGMENTS + 1),
      heads: new Float32Array(Math.max(1, pulseDefs.length)),
      envelopes: new Float32Array(Math.max(1, pulseDefs.length)),
      chord: new THREE.Vector3(),
      side: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      control: new THREE.Vector3(),
      white: new THREE.Color('#ffffff'),
    }),
    [pulseDefs.length],
  );

  useFrame((state, delta) => {
    // Clamp delta so a backgrounded tab doesn't make every pulse leap.
    timeRef.current += Math.min(delta, 1 / 20);
    const time = timeRef.current;

    // Advance every pulse head: 0 = leaving the source, 1 = arriving.
    pulseDefs.forEach((pulse, index) => {
      const phase = (time * pulse.speed + pulse.offset) % pulse.cycle;
      scratch.heads[index] = phase;
      const travelling = phase <= 1 + PULSE_OVERSHOOT;
      scratch.envelopes[index] = travelling
        ? smoothstep(0, 0.08, phase) * (1 - smoothstep(1, 1 + PULSE_OVERSHOOT, phase)) * pulse.strength
        : 0;
    });

    // Keep the shader's animated skeleton in sync with the current node
    // positions, so the travelling packets don't freeze at their camera-
    // relative birth location when the camera zooms out.
    const skeleton = pulseGeometry.getAttribute('aSkeleton');
    if (skeleton) {
      const skel = skeleton.array as Float32Array;
      let cursor = 0;
      edges.forEach((edge) => {
        const from = nodeRefs.current.get(edge.fromId)?.position;
        const to = nodeRefs.current.get(edge.toId)?.position;
        if (!from || !to) {
          cursor += 3;
          cursor += 3;
          cursor += 3;
          return;
        }
        skeletonRef.current[0].set(from.x, from.y, from.z);
        skeletonRef.current[1].set(to.x, to.y, to.z);
        skel[cursor * 3] = skeletonRef.current[0].x;
        skel[cursor * 3 + 1] = skeletonRef.current[0].y;
        skel[cursor * 3 + 2] = skeletonRef.current[0].z;
        cursor += 1;
        skel[cursor * 3] = edge.control.x;
        skel[cursor * 3 + 1] = edge.control.y;
        skel[cursor * 3 + 2] = edge.control.z;
        cursor += 1;
        skel[cursor * 3] = skeletonRef.current[1].x;
        skel[cursor * 3 + 1] = skeletonRef.current[1].y;
        skel[cursor * 3 + 2] = skeletonRef.current[1].z;
        cursor += 1;
      });
      skeleton.needsUpdate = true;
    }

    const positions = lineGeometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = lineGeometry.getAttribute('color') as THREE.BufferAttribute;
    const pulsePositions = pulseGeometry.getAttribute('position') as THREE.BufferAttribute;
    const pulseAlphas = pulseGeometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    const posArray = positions.array as Float32Array;
    const colArray = colors.array as Float32Array;
    const { points, glow, chord, side, up, control } = scratch;

    edges.forEach((edge, edgeIndex) => {
      const from = nodeRefs.current.get(edge.fromId)?.position;
      const to = nodeRefs.current.get(edge.toId)?.position;
      const vertexBase = edgeIndex * CURVE_SEGMENTS * 2;

      if (!from || !to) {
        colArray.fill(0, vertexBase * 3, (vertexBase + CURVE_SEGMENTS * 2) * 3);
        for (const pulseIndex of pulsesByEdge[edgeIndex]) pulseAlphas.setX(pulseIndex, 0);
        return;
      }

      // Quadratic Bezier: bow sideways and arc up/down, scaled by chord length,
      // so filaments sweep through space instead of cutting straight across.
      chord.subVectors(to, from);
      const length = chord.length() || 1;
      side.crossVectors(chord, up);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const curve = curves[edgeIndex];
      control
        .addVectors(from, to)
        .multiplyScalar(0.5)
        .addScaledVector(side, curve.bend * length)
        .addScaledVector(up, curve.lift * length);

      for (let k = 0; k <= CURVE_SEGMENTS; k += 1) {
        const s = k / CURVE_SEGMENTS;
        const a = (1 - s) * (1 - s);
        const b = 2 * (1 - s) * s;
        const c = s * s;
        points[k * 3] = a * from.x + b * control.x + c * to.x;
        points[k * 3 + 1] = a * from.y + b * control.y + c * to.y;
        points[k * 3 + 2] = a * from.z + b * control.z + c * to.z;

        let light = 0;
        for (const pulseIndex of pulsesByEdge[edgeIndex]) {
          const envelope = scratch.envelopes[pulseIndex];
          if (envelope > 0) light += pulseShape(s, scratch.heads[pulseIndex]) * envelope;
        }
        glow[k] = Math.min(light, 1.6);
      }

      // Light runs through the filament itself: base tint + a white-hot travelling band.
      const base = baseColors[edgeIndex];
      for (let k = 0; k < CURVE_SEGMENTS; k += 1) {
        for (let end = 0; end < 2; end += 1) {
          const sample = k + end;
          const vertex = (vertexBase + k * 2 + end) * 3;
          posArray[vertex] = points[sample * 3];
          posArray[vertex + 1] = points[sample * 3 + 1];
          posArray[vertex + 2] = points[sample * 3 + 2];
          const g = glow[sample];
          colArray[vertex] = base.r * (FILAMENT_BASE + g * 0.9) + g * 0.35;
          colArray[vertex + 1] = base.g * (FILAMENT_BASE + g * 0.9) + g * 0.35;
          colArray[vertex + 2] = base.b * (FILAMENT_BASE + g * 0.9) + g * 0.35;
        }
      }

      // Soft bloom riding on each pulse head.
      for (const pulseIndex of pulsesByEdge[edgeIndex]) {
        const head = scratch.heads[pulseIndex];
        const s = Math.min(1, head);
        const a = (1 - s) * (1 - s);
        const b = 2 * (1 - s) * s;
        const c = s * s;
        pulsePositions.setXYZ(
          pulseIndex,
          a * from.x + b * control.x + c * to.x,
          a * from.y + b * control.y + c * to.y,
          a * from.z + b * control.z + c * to.z,
        );
        const headEnvelope =
          head <= 1 ? smoothstep(0, 0.08, head) * (1 - smoothstep(0.86, 1, head)) : 0;
        pulseAlphas.setX(pulseIndex, headEnvelope * pulseDefs[pulseIndex].strength * 0.85);
      }
    });

    positions.needsUpdate = true;
    colors.needsUpdate = true;
    pulsePositions.needsUpdate = true;
    pulseAlphas.needsUpdate = true;
    pulseMaterial.uniforms.uDpr.value = state.viewport.dpr;
  });

  if (edges.length === 0) return null;

  return (
    <>
      <lineSegments geometry={lineGeometry} frustumCulled={false} raycast={NO_RAYCAST}>
        <lineBasicMaterial
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>
      <points geometry={pulseGeometry} material={pulseMaterial} frustumCulled={false} raycast={NO_RAYCAST} />
    </>
  );
}

export function TopicGraph({
  items,
  selectedId,
  onSelect,
}: {
  items: MindItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focus, setFocus] = useState<CameraFocus | null>(null);
  const lastSelected = useRef<string | null>(null);
  const nodeRefs = useRef<Map<string, THREE.Object3D>>(new Map());

  const registerRef = useCallback((id: string, obj: THREE.Object3D | null) => {
    if (obj) nodeRefs.current.set(id, obj);
    else nodeRefs.current.delete(id);
  }, []);

  const clusters = useMemo<Cluster[]>(() => {
    const map = new Map<string, { name: string; color: string; region: Region; items: MindItem[] }>();
    for (const item of items) {
      const name = item.topic || 'Untagged';
      const color = item.topicColor || '#94a3b8';
      if (!map.has(name)) {
        map.set(name, { name, color, region: item.region, items: [] });
      }
      map.get(name)!.items.push(item);
    }
    const list = [...map.values()];
    // Each topic's solar system sits on a spiral arm, spread out along the
    // arms (golden-ratio stepping) so zooming to one is a real journey.
    return list.map((cluster, index) => {
      const random = mulberry32(hashValue(`cluster:${cluster.name}`));
      const arm = index % 4;
      const t = 0.16 + ((index * 0.618034 + 0.21) % 1) * 0.34;
      const center = milkyWayArmPoint(t, arm, (random() - 0.5) * 6);
      return { ...cluster, center };
    });
  }, [items]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const edges = useMemo<GraphEdge[]>(() => {
    const seen = new Set<string>();
    const out: GraphEdge[] = [];
    const add = (fromId: string, toId: string, color: string) => {
      if (fromId === toId) return;
      const key = fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ fromId, toId, color });
    };

    // Real AI-detected relations first.
    for (const item of items) {
      for (const relatedId of item.relatedIds ?? []) {
        if (itemById.has(relatedId)) {
          add(item.id, relatedId, item.topicColor || '#94a3b8');
        }
      }
    }

    // Then wandering filaments: each planet reaches out to one or two random
    // places elsewhere in the galaxy (other planets, or other topics' stars),
    // never back to its own star. Seeded by id so they're stable across renders.
    const topicIds = [...new Set(items.map((item) => `topic:${item.topic || 'Untagged'}`))];
    for (const item of items) {
      const ownTopic = `topic:${item.topic || 'Untagged'}`;
      const random = mulberry32(hashValue(`${item.id}:filaments`));
      const otherPlanets = items.filter((other) => other.id !== item.id).map((other) => other.id);
      const foreignPlanets = items
        .filter((other) => (other.topic || 'Untagged') !== (item.topic || 'Untagged'))
        .map((other) => other.id);
      const foreignStars = topicIds.filter((id) => id !== ownTopic);
      const reach = random() < 0.4 ? 2 : 1;
      for (let n = 0; n < reach; n += 1) {
        const roll = random();
        const pool =
          roll < 0.25 && foreignStars.length > 0
            ? foreignStars
            : roll < 0.65 && foreignPlanets.length > 0
              ? foreignPlanets
              : otherPlanets;
        if (pool.length === 0) continue;
        add(item.id, pool[Math.floor(random() * pool.length)], item.topicColor || '#94a3b8');
      }
    }
    return out.slice(0, 90);
  }, [items, itemById]);

  const ambientStars = useMemo<AmbientStarSpec[]>(() => {
    const random = mulberry32(909091);
    const palette = ['#dce8f4', '#f6e8cd', '#c7d8ec', '#f8fbff'];
    const count = 40;
    const stars: AmbientStarSpec[] = [];
    for (let i = 0; i < count; i += 1) {
      // Uncharted solar systems scattered along the arms, to discover up close.
      const arm = Math.floor(random() * 4);
      const t = 0.08 + random() * 0.6;
      const [ax, , az] = milkyWayArmPoint(t, arm);
      const x = ax + (random() - 0.5) * 40;
      const z = az + (random() - 0.5) * 40;
      const y = (random() - 0.5) * 8;
      const color = palette[Math.floor(random() * palette.length)];
      const planetCount = 1 + Math.floor(random() * 4);
      const planets: AmbientPlanetSpec[] = Array.from({ length: planetCount }, (_, pi) => {
        const r = mulberry32(hashValue(`ambient:${i}:planet:${pi}`));
        const a = 0.8 + r() * 1.6;
        const b = a * (0.75 + r() * 0.22);
        return {
          a,
          b,
          tiltX: (r() - 0.5) * 0.8,
          tiltZ: (r() - 0.5) * 0.8,
          yaw: r() * Math.PI * 2,
          speed: 0.03 + r() * 0.06,
          phase: r() * Math.PI * 2,
          size: 0.03 + r() * 0.04,
        };
      });
      stars.push({ position: [x, y, z], color, planets });
    }
    return stars;
  }, []);

  const view = useMemo(
    () => ({
      // Far enough out that the whole galaxy reads as one shape.
      home: [0, 1250, 1450] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
      focusDistance: 3.2,
      minDistance: 0.8,
      maxDistance: 3600,
    }),
    [],
  );

  useEffect(() => {
    if (selectedId === lastSelected.current) return;
    lastSelected.current = selectedId;
    if (!selectedId) {
      setFocus({ position: null, token: Date.now() });
      return;
    }
    const node = nodeRefs.current.get(selectedId);
    if (node) {
      // Follow the live planet: it keeps orbiting while we fly in.
      setFocus({ position: null, follow: node, token: Date.now() });
      return;
    }
    const item = itemById.get(selectedId);
    const cluster = clusters.find((entry) => entry.name === (item?.topic || 'Untagged'));
    if (cluster) {
      setFocus({ position: cluster.center, distance: 24, token: Date.now() });
    }
  }, [selectedId, clusters, itemById]);

  return (
    <Canvas
      camera={{ position: [0, 1250, 1450], fov: 52, near: 0.05, far: 40000 }}
      style={{ position: 'absolute', inset: 0, background: '#000000' }}
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={['#000000']} />
      <CameraController focus={focus} view={view} warp />
      {/* Distant background stars far beyond the galaxy. */}
      <DeepStarfield count={6000} innerRadius={14000} depth={6000} />
      <MilkyWay />
      {/* Scaled up so it still reads as the galaxy's heart from far away. */}
      <group scale={4}>
        <BlackHole />
      </group>
      {clusters.map((cluster) => (
        <TopicHub key={cluster.name} cluster={cluster} registerRef={registerRef} />
      ))}
      {items.map((item) => {
        const cluster = clusters.find((entry) => entry.name === (item.topic || 'Untagged'));
        if (!cluster) return null;
        return (
          <Planet
            key={item.id}
            item={item}
            clusterCenter={cluster.center}
            nodeRefs={nodeRefs}
            registerRef={registerRef}
            selected={item.id === selectedId}
            hovered={item.id === hoveredId}
            onHover={setHoveredId}
            onSelect={onSelect}
          />
        );
      })}
      {ambientStars.map((star, index) => (
        <AmbientStar key={`ambient-star-${index}`} spec={star} />
      ))}
      <DynamicEdges edges={edges} nodeRefs={nodeRefs} />
    </Canvas>
  );
}
