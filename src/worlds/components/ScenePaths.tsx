import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneEdge } from '../layout';

export interface PulseConfig {
  /** Pulses travelling on each filament. */
  perEdge: number;
  size: number;
  /** Cycles per second at rest; selection roughly triples it. */
  speed: number;
  opacity: number;
  color?: string;
  /** 0-1 spread applied to packet size and travel speed. */
  variability?: number;
  /** If set, packets only spark during brief periodic windows. */
  burst?: { rate: number; window: number };
}

interface ScenePathsProps {
  edges: SceneEdge[];
  activeIds: Set<string> | null;
  selectedId: string | null;
  opacity: number;
  color?: string;
  additive?: boolean;
  /** `null` disables the travelling pulses for this edge set. */
  pulse?: PulseConfig | null;
}

const SEGMENTS = 20;
const WHITE = new THREE.Color('#ffffff');
const NO_RAYCAST = () => null;

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

const PULSE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uSpeed;
  uniform float uDpr;
  uniform float uVariability;
  uniform float uBurst;
  uniform float uBurstRate;
  uniform float uBurstWindow;

  attribute vec3 aStart;
  attribute vec3 aControl;
  attribute vec3 aEnd;
  attribute vec3 aColor;
  attribute float aOffset;
  attribute float aStrength;
  attribute float aVariation;

  varying vec3 vColor;
  varying float vStrength;

  void main() {
    // Mixed small and large impulses, each with its own travel speed.
    float variation = mix(1.0, 0.3 + 1.7 * aVariation, uVariability);
    float speed = uSpeed * variation * (0.55 + aStrength);
    float t = fract(uTime * speed + aOffset);

    vec3 point = mix(mix(aStart, aControl, t), mix(aControl, aEnd, t), t);
    vec4 viewPosition = modelViewMatrix * vec4(point, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    float fade =
      smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.84, 1.0, t));

    // Burst-only packets stay invisible between short probing windows.
    float gate = 1.0;
    if (uBurst > 0.5) {
      float phase = fract(uTime * uBurstRate + aOffset);
      gate =
        smoothstep(0.0, 0.12, phase) *
        (1.0 - smoothstep(uBurstWindow, uBurstWindow + 0.1, phase));
    }

    float size =
      uSize * uDpr * (0.35 + 1.2 * aStrength) * variation * fade * gate *
      (78.0 / max(4.0, -viewPosition.z));
    gl_PointSize = clamp(size, 0.0, 22.0);

    vColor = aColor;
    vStrength = (0.25 + 0.75 * aStrength) * fade * gate;
  }
`;

const PULSE_FRAGMENT = /* glsl */ `
  uniform float uOpacity;

  varying vec3 vColor;
  varying float vStrength;

  void main() {
    vec2 coord = gl_PointCoord - 0.5;
    float distanceToCenter = length(coord);
    if (distanceToCenter > 0.5) discard;

    float core = smoothstep(0.5, 0.05, distanceToCenter);
    float alpha = core * uOpacity * vStrength * 1.2;
    gl_FragColor = vec4(vColor * (0.85 + vStrength * 1.05), min(alpha, 1.0));
  }
`;

/**
 * Connections as curved filaments plus travelling light packets. One batched
 * line draw call and one batched point draw call serve the whole graph.
 */
export function ScenePaths({
  edges,
  activeIds,
  selectedId,
  opacity,
  color,
  additive = false,
  pulse = null,
}: ScenePathsProps) {
  const dpr = useThree((state) => state.viewport.dpr);

  const visible = useMemo(
    () =>
      edges.filter((edge) => {
        if (!activeIds) return true;
        if (
          selectedId &&
          (edge.fromId === selectedId || edge.toId === selectedId)
        ) {
          return true;
        }
        return activeIds.has(edge.fromId) && activeIds.has(edge.toId);
      }),
    [edges, activeIds, selectedId],
  );

  const lineGeometry = useMemo(() => {
    if (visible.length === 0) return null;

    const positions = new Float32Array(visible.length * SEGMENTS * 6);
    const colors = new Float32Array(visible.length * SEGMENTS * 6);
    const start = new THREE.Vector3();
    const control = new THREE.Vector3();
    const end = new THREE.Vector3();
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const scratch = new THREE.Vector3();
    const tint = new THREE.Color();

    function pointOn(t: number, out: THREE.Vector3) {
      out.copy(start).lerp(control, t);
      scratch.copy(control).lerp(end, t);
      return out.lerp(scratch, t);
    }

    visible.forEach((edge, edgeIndex) => {
      start.set(edge.from[0], edge.from[1], edge.from[2]);
      control.set(edge.control[0], edge.control[1], edge.control[2]);
      end.set(edge.to[0], edge.to[1], edge.to[2]);

      const incident =
        selectedId !== null &&
        (edge.fromId === selectedId || edge.toId === selectedId);
      tint.set(color ?? edge.color);
      if (incident) tint.lerp(WHITE, 0.65);

      for (let segment = 0; segment < SEGMENTS; segment += 1) {
        pointOn(segment / SEGMENTS, p0);
        pointOn((segment + 1) / SEGMENTS, p1);

        const offset = (edgeIndex * SEGMENTS + segment) * 6;
        positions[offset] = p0.x;
        positions[offset + 1] = p0.y;
        positions[offset + 2] = p0.z;
        positions[offset + 3] = p1.x;
        positions[offset + 4] = p1.y;
        positions[offset + 5] = p1.z;

        colors[offset] = tint.r;
        colors[offset + 1] = tint.g;
        colors[offset + 2] = tint.b;
        colors[offset + 3] = tint.r;
        colors[offset + 4] = tint.g;
        colors[offset + 5] = tint.b;
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }, [visible, selectedId, color]);

  const pulseGeometry = useMemo(() => {
    if (!pulse || visible.length === 0) return null;

    const perEdge = Math.max(1, Math.round(pulse.perEdge));
    const total = visible.length * perEdge;
    const positions = new Float32Array(total * 3);
    const starts = new Float32Array(total * 3);
    const controls = new Float32Array(total * 3);
    const ends = new Float32Array(total * 3);
    const offsets = new Float32Array(total);
    const strengths = new Float32Array(total);
    const variations = new Float32Array(total);
    const colors = new Float32Array(total * 3);
    const tint = new THREE.Color();

    let cursor = 0;
    for (const edge of visible) {
      const incident =
        selectedId !== null &&
        (edge.fromId === selectedId || edge.toId === selectedId);
      const matched =
        activeIds !== null &&
        activeIds.has(edge.fromId) &&
        activeIds.has(edge.toId);
      const strength = incident ? 1 : matched ? 0.8 : 0.38;

      tint.set(pulse.color ?? color ?? edge.color);

      for (let packet = 0; packet < perEdge; packet += 1) {
        const key = `${edge.fromId}:${edge.toId}:${packet}`;
        starts.set(edge.from, cursor * 3);
        controls.set(edge.control, cursor * 3);
        ends.set(edge.to, cursor * 3);
        offsets[cursor] =
          (packet + 0.15 + unit(`${key}:offset`) * 0.7) / perEdge;
        strengths[cursor] = strength;
        variations[cursor] = unit(`${key}:variation`);
        colors.set([tint.r, tint.g, tint.b], cursor * 3);
        cursor += 1;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aStart', new THREE.BufferAttribute(starts, 3));
    geometry.setAttribute('aControl', new THREE.BufferAttribute(controls, 3));
    geometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 3));
    geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));
    geometry.setAttribute('aStrength', new THREE.BufferAttribute(strengths, 1));
    geometry.setAttribute(
      'aVariation',
      new THREE.BufferAttribute(variations, 1),
    );
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }, [visible, selectedId, activeIds, color, pulse]);

  const pulseMaterial = useMemo(() => {
    if (!pulse) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: pulse.size },
        uSpeed: { value: pulse.speed },
        uOpacity: { value: pulse.opacity },
        uDpr: { value: dpr },
        uVariability: { value: pulse.variability ?? 0.7 },
        uBurst: { value: pulse.burst ? 1 : 0 },
        uBurstRate: { value: pulse.burst?.rate ?? 0.12 },
        uBurstWindow: { value: pulse.burst?.window ?? 0.1 },
      },
      vertexShader: PULSE_VERTEX,
      fragmentShader: PULSE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, [pulse, dpr]);

  useEffect(
    () => () => {
      lineGeometry?.dispose();
    },
    [lineGeometry],
  );

  useEffect(
    () => () => {
      pulseGeometry?.dispose();
    },
    [pulseGeometry],
  );

  useEffect(
    () => () => {
      pulseMaterial?.dispose();
    },
    [pulseMaterial],
  );

  useFrame((state) => {
    if (pulseMaterial) {
      pulseMaterial.uniforms.uTime.value = state.clock.elapsedTime;
      pulseMaterial.uniforms.uDpr.value = state.viewport.dpr;
    }
  });

  return (
    <>
      {lineGeometry && (
        <lineSegments
          geometry={lineGeometry}
          frustumCulled={false}
          raycast={NO_RAYCAST}
        >
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={opacity}
            depthWrite={false}
            blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
            toneMapped={false}
          />
        </lineSegments>
      )}
      {pulseGeometry && pulseMaterial && (
        <points
          geometry={pulseGeometry}
          material={pulseMaterial}
          frustumCulled={false}
          raycast={NO_RAYCAST}
        />
      )}
    </>
  );
}
