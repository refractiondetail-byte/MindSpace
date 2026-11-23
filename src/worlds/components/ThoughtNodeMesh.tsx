import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { REGION_META, type ThoughtNode } from '../../core/types';
import type { NodePlacement } from '../layout';
import type { NodeVisuals } from '../types';

interface ThoughtNodeMeshProps {
  node: ThoughtNode;
  placement: NodePlacement;
  visuals: NodeVisuals;
  hovered: boolean;
  selected: boolean;
  dimmed: boolean;
  interactive: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

export function ThoughtNodeMesh({
  node,
  placement,
  visuals,
  hovered,
  selected,
  dimmed,
  interactive,
  onHover,
  onSelect,
}: ThoughtNodeMeshProps) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const meta = REGION_META[node.region];
  const accent = meta.accent;

  useFrame((state, delta) => {
    const target =
      placement.scale * (selected ? 1.5 : hovered ? 1.22 : dimmed ? 0.7 : 1);
    if (group.current) {
      const next = THREE.MathUtils.damp(group.current.scale.x, target, 9, delta);
      group.current.scale.setScalar(next);
    }
    if (ring.current) {
      ring.current.rotation.y += delta * 0.55;
      ring.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.35) * 0.4;
    }
  });

  return (
    <group ref={group} position={placement.position}>
      <mesh
        onClick={
          interactive
            ? (event) => {
                event.stopPropagation();
                onSelect(node.id);
              }
            : undefined
        }
        onPointerOver={
          interactive
            ? (event) => {
                event.stopPropagation();
                onHover(node.id);
              }
            : undefined
        }
        onPointerOut={interactive ? () => onHover(null) : undefined}
      >
        {visuals.geometry === 'icosahedron' && (
          <icosahedronGeometry args={[1, visuals.detail]} />
        )}
        {visuals.geometry === 'octahedron' && (
          <octahedronGeometry args={[1, visuals.detail]} />
        )}
        {visuals.geometry === 'sphere' && <sphereGeometry args={[1, 28, 28]} />}

        {visuals.material === 'standard' ? (
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={visuals.emissiveIntensity}
            roughness={visuals.roughness}
            metalness={visuals.metalness}
            transparent
            opacity={dimmed ? 0.18 : 1}
          />
        ) : (
          <meshBasicMaterial color={accent} transparent opacity={dimmed ? 0.16 : 1} />
        )}
      </mesh>

      {visuals.haloOpacity > 0 && (
        <mesh scale={visuals.haloScale} raycast={() => null}>
          <sphereGeometry args={[1, 20, 20]} />
          <meshBasicMaterial
            color={accent}
            transparent
            opacity={dimmed ? visuals.haloOpacity * 0.12 : visuals.haloOpacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {selected && (
        <mesh ref={ring} scale={1.95} raycast={() => null}>
          <icosahedronGeometry args={[1, 1]} />
          <meshBasicMaterial
            color={accent}
            wireframe
            transparent
            opacity={0.55}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {hovered && !dimmed && (
        <Html
          position={[0, 1.6, 0]}
          center
          zIndexRange={[40, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="hud-panel w-max max-w-[16rem] px-2.5 py-1.5 text-left">
            <p
              className="text-[9px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: accent }}
            >
              {meta.label}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug text-white">
              {node.title}
            </p>
            {node.tags.length > 0 && (
              <p className="mt-0.5 truncate text-[10px] text-slate-400">
                #{node.tags.slice(0, 3).join(' #')}
              </p>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
