import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3 } from '../layout';

const NO_RAYCAST = () => null;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface Dendrite {
  mid: Vec3;
  end: Vec3;
  radius: number;
  phase: number;
}

interface NeuronStructure {
  dendrites: Dendrite[];
  axon: { mid: Vec3; end: Vec3 };
}

function seedFrom(value: string): number {
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

interface SegmentProps {
  from: Vec3;
  to: Vec3;
  radius: number;
  color: string;
  opacity: number;
}

function Segment({ from, to, radius, color, opacity }: SegmentProps) {
  const transform = useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const length = Math.max(0.001, direction.length());
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      Y_AXIS,
      direction.clone().normalize(),
    );
    const position = start.clone().addScaledVector(direction, 0.5);
    return { length, quaternion, position };
  }, [from, to]);

  return (
    <mesh
      position={transform.position}
      quaternion={transform.quaternion}
      raycast={NO_RAYCAST}
    >
      <cylinderGeometry args={[radius * 0.55, radius, transform.length, 5, 1]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

interface NeuronNodeProps {
  seed: string;
  accent: string;
  dimmed: boolean;
  firing: boolean;
}

/**
 * Soma satellites for the Brain world: branching dendrites, one long axon with
 * a terminal bulb, a pulsing somatic glow, and light packets that run outward
 * along the dendrites so every thought visibly fires.
 */
export function NeuronNode({ seed, accent, dimmed, firing }: NeuronNodeProps) {
  const structure = useMemo<NeuronStructure>(() => {
    const random = mulberry32(seedFrom(seed));

    const dendrites = Array.from({ length: 7 }, () => {
      const azimuth = random() * Math.PI * 2;
      const elevation = Math.acos(2 * random() - 1);
      const length = 1.5 + random() * 1.4;
      const direction = new THREE.Vector3(
        Math.sin(elevation) * Math.cos(azimuth),
        Math.cos(elevation),
        Math.sin(elevation) * Math.sin(azimuth),
      );

      const mid: Vec3 = [
        direction.x * length * 0.5 + (random() - 0.5) * 0.7,
        direction.y * length * 0.5 + (random() - 0.5) * 0.7,
        direction.z * length * 0.5 + (random() - 0.5) * 0.7,
      ];
      const end: Vec3 = [
        direction.x * length,
        direction.y * length,
        direction.z * length,
      ];

      return { mid, end, radius: 0.035 + random() * 0.03, phase: random() };
    });

    const axonDirection = new THREE.Vector3(
      0.35 + random() * 0.6,
      0.25 + random() * 0.5,
      0.45 + random() * 0.55,
    ).normalize();
    const axonLength = 3.1 + random() * 0.8;

    return {
      dendrites,
      axon: {
        mid: [
          axonDirection.x * axonLength * 0.45 + 0.22,
          axonDirection.y * axonLength * 0.45 + 0.12,
          axonDirection.z * axonLength * 0.45,
        ],
        end: [
          axonDirection.x * axonLength,
          axonDirection.y * axonLength,
          axonDirection.z * axonLength,
        ],
      },
    };
  }, [seed]);

  const dendriteSparks = useRef<(THREE.Mesh | null)[]>([]);
  const axonSpark = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const glowMaterial = useRef<THREE.MeshBasicMaterial | null>(null);

  const timeRef = useRef(0);
  useFrame((_, delta) => {
    timeRef.current += delta;
    const time = timeRef.current;
    const pace = firing ? 1.8 : 0.9;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.1);

    if (glow.current) {
      glow.current.scale.setScalar(1.35 + pulse * 0.35);
    }
    if (glowMaterial.current) {
      glowMaterial.current.opacity = dimmed ? 0.02 : 0.16 + pulse * 0.2;
    }

    structure.dendrites.forEach((dendrite, index) => {
      const spark = dendriteSparks.current[index];
      if (!spark) return;
      const t = (time * pace + dendrite.phase * 4) % 1;
      const inverse = 1 - t;
      spark.position.set(
        2 * inverse * t * dendrite.mid[0] + t * t * dendrite.end[0],
        2 * inverse * t * dendrite.mid[1] + t * t * dendrite.end[1],
        2 * inverse * t * dendrite.mid[2] + t * t * dendrite.end[2],
      );
      spark.scale.setScalar(0.55 + Math.sin(t * Math.PI) * 1.1);
      const material = spark.material as THREE.MeshBasicMaterial;
      material.opacity = dimmed ? 0 : Math.sin(t * Math.PI) * 0.9;
    });

    if (axonSpark.current) {
      const t = (time * pace * 0.65) % 1;
      const inverse = 1 - t;
      axonSpark.current.position.set(
        2 * inverse * t * structure.axon.mid[0] + t * t * structure.axon.end[0],
        2 * inverse * t * structure.axon.mid[1] + t * t * structure.axon.end[1],
        2 * inverse * t * structure.axon.mid[2] + t * t * structure.axon.end[2],
      );
      axonSpark.current.scale.setScalar(0.7 + Math.sin(t * Math.PI) * 1.4);
      const material = axonSpark.current.material as THREE.MeshBasicMaterial;
      material.opacity = dimmed ? 0 : 0.35 + Math.sin(t * Math.PI) * 0.65;
    }
  });

  const branchOpacity = dimmed ? 0.05 : 0.55;
  const tipOpacity = dimmed ? 0.04 : 0.5;

  return (
    <>
      {structure.dendrites.map((dendrite, index) => (
        <group key={index}>
          <Segment
            from={[0, 0, 0]}
            to={dendrite.mid}
            radius={dendrite.radius}
            color={accent}
            opacity={branchOpacity}
          />
          <Segment
            from={dendrite.mid}
            to={dendrite.end}
            radius={dendrite.radius * 0.7}
            color={accent}
            opacity={branchOpacity * 0.9}
          />

          <mesh position={dendrite.end} raycast={NO_RAYCAST}>
            <sphereGeometry args={[dendrite.radius * 1.7, 8, 8]} />
            <meshBasicMaterial
              color={accent}
              transparent
              opacity={tipOpacity}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>

          <mesh
            ref={(element) => {
              dendriteSparks.current[index] = element;
            }}
            raycast={NO_RAYCAST}
          >
            <sphereGeometry args={[0.11, 8, 8]} />
            <meshBasicMaterial
              color="#fff7ed"
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      <Segment
        from={[0, 0, 0]}
        to={structure.axon.mid}
        radius={0.055}
        color={accent}
        opacity={branchOpacity}
      />
      <Segment
        from={structure.axon.mid}
        to={structure.axon.end}
        radius={0.04}
        color={accent}
        opacity={branchOpacity}
      />

      <mesh position={structure.axon.end} raycast={NO_RAYCAST}>
        <sphereGeometry args={[0.15, 10, 10]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={tipOpacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={axonSpark} raycast={NO_RAYCAST}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshBasicMaterial
          color="#fef3c7"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={glow} raycast={NO_RAYCAST}>
        <sphereGeometry args={[1.05, 16, 16]} />
        <meshBasicMaterial
          ref={(el) => { glowMaterial.current = el; }}
          color={accent}
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
