import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { CameraController, type CameraFocus } from './components/CameraController';
import * as THREE from 'three';
import type { MindItem } from '../ui/types';
import type { Region } from '../core/types';
import { StarNode } from './components/StarNode';
import { DeepStarfield } from './components/DeepStarfield';
import { GalaxyDust } from './components/GalaxyDust';
import { BlackHole } from './components/BlackHole';
import { GALAXY_SHAPE, galaxyArmAngle, galaxyArmRadius } from './layout';

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

function unit(value: string): number {
  return (hashValue(value) % 1000) / 1000;
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
    gl_PointSize = clamp(aSize * uDpr * (80.0 / max(8.0, -viewPosition.z)), 1.0, 20.0);
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;

const PULSE_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 coord = gl_PointCoord - 0.5;
    float d = length(coord);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * (0.9 + core * 0.8), core * vAlpha);
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

function DynamicEdges({
  edges,
  nodeRefs,
}: {
  edges: GraphEdge[];
  nodeRefs: { current: Map<string, THREE.Object3D> };
}) {
  const lineGeometry = useMemo(() => new THREE.BufferGeometry(), []);
  const pulseGeometry = useMemo(() => new THREE.BufferGeometry(), []);
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
  const timeRef = useRef(0);

  const pulseDefs = useMemo(() => {
    const defs: {
      edgeIndex: number;
      offset: number;
      speed: number;
      sizeType: number;
      strength: number;
    }[] = [];
    edges.forEach((edge, ei) => {
      const perEdge = 3 + (hashValue(edge.fromId + edge.toId) % 3);
      for (let p = 0; p < perEdge; p += 1) {
        const key = `${edge.fromId}:${edge.toId}:${p}`;
        defs.push({
          edgeIndex: ei,
          offset: (p + 0.12 + unit(`${key}:offset`) * 0.72) / perEdge,
          speed: 0.04 + unit(`${key}:speed`) * 0.22,
          sizeType: unit(`${key}:size`),
          strength: 0.35 + unit(`${key}:strength`) * 0.65,
        });
      }
    });
    return defs;
  }, [edges]);

  const linePositions = useMemo(
    () => new Float32Array(Math.max(1, edges.length) * 6),
    [edges],
  );
  const lineColors = useMemo(() => {
    const arr = new Float32Array(Math.max(1, edges.length) * 6);
    edges.forEach((edge, ei) => {
      const c = new THREE.Color(edge.color);
      arr[ei * 6] = c.r;
      arr[ei * 6 + 1] = c.g;
      arr[ei * 6 + 2] = c.b;
      arr[ei * 6 + 3] = c.r;
      arr[ei * 6 + 4] = c.g;
      arr[ei * 6 + 5] = c.b;
    });
    return arr;
  }, [edges]);

  const pulsePositions = useMemo(
    () => new Float32Array(Math.max(1, pulseDefs.length) * 3),
    [pulseDefs],
  );
  const pulseColors = useMemo(() => {
    const arr = new Float32Array(Math.max(1, pulseDefs.length) * 3);
    pulseDefs.forEach((p, pi) => {
      const edge = edges[p.edgeIndex];
      const c = new THREE.Color(edge?.color || '#94a3b8');
      const boost = p.sizeType > 0.85 ? 0.6 : 0;
      arr[pi * 3] = Math.min(1, c.r + boost);
      arr[pi * 3 + 1] = Math.min(1, c.g + boost);
      arr[pi * 3 + 2] = Math.min(1, c.b + boost);
    });
    return arr;
  }, [edges, pulseDefs]);
  const pulseSizes = useMemo(
    () => new Float32Array(Math.max(1, pulseDefs.length)),
    [pulseDefs],
  );
  const pulseAlphas = useMemo(
    () => new Float32Array(Math.max(1, pulseDefs.length)),
    [pulseDefs],
  );

  useEffect(() => {
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
    pulseGeometry.setAttribute('position', new THREE.BufferAttribute(pulsePositions, 3));
    pulseGeometry.setAttribute('aColor', new THREE.BufferAttribute(pulseColors, 3));
    pulseGeometry.setAttribute('aSize', new THREE.BufferAttribute(pulseSizes, 1));
    pulseGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(pulseAlphas, 1));
    return () => {
      lineGeometry.dispose();
      pulseGeometry.dispose();
      pulseMaterial.dispose();
    };
  }, [lineGeometry, pulseGeometry, pulseMaterial, linePositions, lineColors, pulsePositions, pulseColors, pulseSizes, pulseAlphas]);

  useFrame((state, delta) => {
    timeRef.current += delta;
    const linePos = lineGeometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (linePos) {
      edges.forEach((edge, ei) => {
        const from = nodeRefs.current.get(edge.fromId)?.position;
        const to = nodeRefs.current.get(edge.toId)?.position;
        if (!from || !to) {
          linePos.setXYZ(ei * 2, 0, 0, 0);
          linePos.setXYZ(ei * 2 + 1, 0, 0, 0);
          return;
        }
        linePos.setXYZ(ei * 2, from.x, from.y, from.z);
        linePos.setXYZ(ei * 2 + 1, to.x, to.y, to.z);
      });
      linePos.needsUpdate = true;
    }

    const pulsePos = pulseGeometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    const pulseSizeAttr = pulseGeometry.getAttribute('aSize') as THREE.BufferAttribute | undefined;
    const pulseAlphaAttr = pulseGeometry.getAttribute('aAlpha') as THREE.BufferAttribute | undefined;
    if (pulsePos && pulseSizeAttr && pulseAlphaAttr) {
      pulseDefs.forEach((p, pi) => {
        const edge = edges[p.edgeIndex];
        const from = edge ? nodeRefs.current.get(edge.fromId)?.position : null;
        const to = edge ? nodeRefs.current.get(edge.toId)?.position : null;
        if (!from || !to || !edge) {
          pulsePos.setXYZ(pi, 0, 0, 0);
          pulseSizeAttr.setX(pi, 0);
          pulseAlphaAttr.setX(pi, 0);
          return;
        }
        const progress = (timeRef.current * p.speed + p.offset) % 1;
        const x = from.x + (to.x - from.x) * progress;
        const y = from.y + (to.y - from.y) * progress;
        const z = from.z + (to.z - from.z) * progress;
        pulsePos.setXYZ(pi, x, y, z);
        const fade = Math.sin(progress * Math.PI);
        const big = p.sizeType > 0.85;
        const baseSize = big ? 8 : p.sizeType > 0.5 ? 4.5 : 2.2;
        pulseSizeAttr.setX(pi, baseSize * (0.45 + 0.55 * fade));
        pulseAlphaAttr.setX(pi, (0.25 + 0.75 * fade) * p.strength * (big ? 1.35 : 1));
      });
      pulsePos.needsUpdate = true;
      pulseSizeAttr.needsUpdate = true;
      pulseAlphaAttr.needsUpdate = true;
    }

    pulseMaterial.uniforms.uDpr.value = state.viewport.dpr;
  });

  if (edges.length === 0) return null;

  return (
    <>
      <lineSegments geometry={lineGeometry} frustumCulled={false} raycast={NO_RAYCAST}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.14}
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
    const radius = Math.max(40, list.length * 14);
    return list.map((cluster, index) => {
      const angle = (index / Math.max(1, list.length)) * Math.PI * 2;
      return {
        ...cluster,
        center: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius] as [number, number, number],
      };
    });
  }, [items]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const edges = useMemo<GraphEdge[]>(() => {
    const seen = new Set<string>();
    const out: GraphEdge[] = [];
    const add = (fromId: string, toId: string, color: string) => {
      const key = fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ fromId, toId, color });
    };
    for (const item of items) {
      for (const relatedId of item.relatedIds ?? []) {
        if (itemById.has(relatedId)) {
          add(item.id, relatedId, item.topicColor || '#94a3b8');
        }
      }
      if (item.entryType === 'attachment' && item.parentId && itemById.has(item.parentId)) {
        add(item.id, item.parentId, item.topicColor || '#94a3b8');
      }
      add(item.id, `topic:${item.topic || 'Untagged'}`, item.topicColor || '#94a3b8');
    }
    return out.slice(0, 90);
  }, [items, itemById]);

  const ambientStars = useMemo<AmbientStarSpec[]>(() => {
    const random = mulberry32(909091);
    const palette = ['#dce8f4', '#f6e8cd', '#c7d8ec', '#f8fbff'];
    const count = 18;
    const stars: AmbientStarSpec[] = [];
    for (let i = 0; i < count; i += 1) {
      const arm = Math.floor(random() * GALAXY_SHAPE.arms);
      const t = Math.min(1, Math.pow(random(), 0.75));
      const angle = galaxyArmAngle(t, arm) + (random() - 0.5) * 0.4;
      const radius = galaxyArmRadius(t) + (random() - 0.5) * 3.0;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = (random() - 0.5) * GALAXY_SHAPE.thickness * (1 - 0.3 * t);
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
      home: [0, 42, 86] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
      focusDistance: 10,
      maxDistance: 320,
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
    const refPos = nodeRefs.current.get(selectedId)?.position;
    if (refPos) {
      setFocus({ position: [refPos.x, refPos.y, refPos.z], token: Date.now() });
      return;
    }
    const item = itemById.get(selectedId);
    const cluster = clusters.find((entry) => entry.name === (item?.topic || 'Untagged'));
    if (cluster) {
      setFocus({ position: cluster.center, token: Date.now() });
    }
  }, [selectedId, clusters, itemById]);

  return (
    <Canvas
      camera={{ position: [0, 24, 36], fov: 52 }}
      style={{ position: 'absolute', inset: 0, background: '#000000' }}
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={['#000000']} />
      <fog attach="fog" args={['#000000', 60, 180]} />
      <CameraController focus={focus} view={view} />
      <DeepStarfield count={3200} />
      <GalaxyDust count={1400} spin={0.012} seed={20261123} />
      <GalaxyDust count={900} spin={0.008} seed={917351} />
      <group scale={1.0}>
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
