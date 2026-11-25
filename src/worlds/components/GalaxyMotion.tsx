import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const NO_RAYCAST = () => null;

interface ArcSpec {
  radius: number;
  span: number;
  offset: number;
  speed: number;
  tilt: [number, number, number];
  color: string;
  opacity: number;
  pulseSpeed?: number;
}



/** Long, thin orbital sweeps that drift independently around the core. */
const ARCS: ArcSpec[] = [
  { radius: 15.4, span: 1.45, offset: 0.4, speed: 0.032, tilt: [0.18, 0, 0.06], color: '#f1d7ad', opacity: 0.17, pulseSpeed: 0.6 },
  { radius: 19.8, span: 1.1, offset: 2.2, speed: 0.024, tilt: [-0.12, 0, 0.14], color: '#f4e4c8', opacity: 0.12, pulseSpeed: 0.5 },
  { radius: 25.6, span: 1.7, offset: 4.4, speed: 0.019, tilt: [0.1, 0, -0.1], color: '#b8cbdf', opacity: 0.09, pulseSpeed: 0.4 },
  { radius: 31.2, span: 0.95, offset: 5.7, speed: 0.014, tilt: [-0.16, 0, 0.04], color: '#dce8f4', opacity: 0.07, pulseSpeed: 0.35 },
];

/** Builds a thin partial-circle arc as line segment pairs. */
function arcGeometry(radius: number, span: number, segments = 120): THREE.BufferGeometry {
  const positions = new Float32Array(segments * 6);

  for (let index = 0; index < segments; index += 1) {
    const a = (index / segments) * span;
    const b = ((index + 1) / segments) * span;
    const offset = index * 6;
    positions[offset] = Math.cos(a) * radius;
    positions[offset + 1] = 0;
    positions[offset + 2] = Math.sin(a) * radius;
    positions[offset + 3] = Math.cos(b) * radius;
    positions[offset + 4] = 0;
    positions[offset + 5] = Math.sin(b) * radius;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export function OrbitalArcs() {
  const groups = useRef<Array<THREE.Group | null>>([]);
  const geometries = useMemo(
    () => ARCS.map((arc) => arcGeometry(arc.radius, arc.span)),
    [],
  );
  const glowMaterials = useMemo(() => ARCS.map(() => {
    const material = new THREE.LineBasicMaterial({
      color: '#fff4dc',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return material;
  }), []);
  const glowMaterialRefs = useRef<Array<THREE.LineBasicMaterial | null>>([]);
  const timeRef = useRef(0);
  useFrame((_, delta) => {
    timeRef.current += delta;
    const time = timeRef.current;
    groups.current.forEach((group, index) => {
      if (!group) return;
      const arc = ARCS[index];
      group.rotation.y = arc.offset + time * arc.speed;

      const glow = glowMaterials[index];
      if (!glow) return;
      const pulse = 0.5 + 0.5 * Math.sin(time * (arc.pulseSpeed ?? 0.5) + index * 1.3);
      glow.opacity = arc.opacity * pulse * pulse * 0.9;
    });

    glowMaterialRefs.current.forEach((glow, glowIndex) => {
      if (!glow) return;
      const arc = ARCS[glowIndex];
      const pulse = 0.5 + 0.5 * Math.sin(time * (arc.pulseSpeed ?? 0.5) + glowIndex * 1.3);
      glow.opacity = arc.opacity * pulse * pulse * 0.9;
    });
  });

  return (
    <>
      {ARCS.map((arc, index) => {
        return (
          <group key={`${arc.radius}-${arc.offset}`} rotation={arc.tilt}>
            <group
              ref={(element) => {
                groups.current[index] = element;
              }}
            >
              <lineSegments geometry={geometries[index]} raycast={NO_RAYCAST}>
                <lineBasicMaterial
                  color={arc.color}
                  transparent
                  opacity={arc.opacity}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                  toneMapped={false}
                />
              </lineSegments>

              <lineSegments geometry={geometries[index]} raycast={NO_RAYCAST}>
                <lineBasicMaterial
                  ref={(node) => { glowMaterialRefs.current[index] = node; }}
                  color="#fff4dc"
                  transparent
                  opacity={0}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </lineSegments>
            </group>
          </group>
        );
      })}
    </>
  );
}

interface StreakSpec {
  start: [number, number, number];
  direction: [number, number, number];
  length: number;
  travel: number;
  period: number;
  delay: number;
  color: string;
  strength: number;
}

/** Sparse meteors crossing the outer starfield. */
const STREAKS: StreakSpec[] = [
  { start: [-42, 16, -24], direction: [1, 0.05, 0.4], length: 9, travel: 78, period: 13.5, delay: 1.5, color: '#fff1d4', strength: 0.65 },
  { start: [36, 21, -30], direction: [-1, -0.08, 0.28], length: 7, travel: 66, period: 17.5, delay: 8.2, color: '#dfeaff', strength: 0.52 },
  { start: [-28, 9, 38], direction: [0.9, 0.12, -0.6], length: 6, travel: 62, period: 21, delay: 15.4, color: '#f3dfb9', strength: 0.38 },
  { start: [48, -12, -40], direction: [-0.85, 0.06, 0.5], length: 7, travel: 70, period: 15.4, delay: 3.3, color: '#fff4e0', strength: 0.55 },
  { start: [-46, -14, 22], direction: [0.7, -0.1, -0.7], length: 6, travel: 64, period: 19.2, delay: 9.7, color: '#eaf2ff', strength: 0.45 },
  { start: [22, 30, 30], direction: [-0.95, 0.22, -0.28], length: 8, travel: 72, period: 16.8, delay: 5.9, color: '#ffe9cf', strength: 0.5 },
];

function Streak({ spec }: { spec: StreakSpec }) {
  const material = useRef<THREE.LineBasicMaterial | null>(null);
  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    return buffer;
  }, []);
  const timeRef = useRef(0);
  const start = useMemo(() => new THREE.Vector3(...spec.start), [spec.start]);
  const direction = useMemo(
    () => new THREE.Vector3(...spec.direction).normalize(),
    [spec.direction],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    timeRef.current += delta;
    const time = timeRef.current;
    const activeWindow = 0.28;
    const phase = ((time + spec.delay) % spec.period) / spec.period;
    const active = phase < activeWindow;
    const progress = active ? phase / activeWindow : 1;
    const alpha = active
      ? Math.sin(progress * Math.PI) * spec.strength
      : 0;

    const head = start.clone().addScaledVector(direction, progress * spec.travel);
    const tail = head
      .clone()
      .addScaledVector(direction, -spec.length * (0.35 + progress * 0.65));

    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, head.x, head.y, head.z);
    positions.setXYZ(1, tail.x, tail.y, tail.z);
    positions.needsUpdate = true;

    if (material.current) material.current.opacity = alpha;
  });

  return (
    <lineSegments geometry={geometry} frustumCulled={false} raycast={NO_RAYCAST}>
      <lineBasicMaterial
        ref={(el) => { material.current = el; }}
        color={spec.color}
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}

export function ShootingStars() {
  return (
    <>
      {STREAKS.map((spec) => (
        <Streak key={`${spec.period}-${spec.delay}`} spec={spec} />
      ))}
    </>
  );
}
