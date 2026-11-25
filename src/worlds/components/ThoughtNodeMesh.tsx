import { useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { REGION_META, type Region, type ThoughtNode } from '../../core/types';
import { getClusterName } from '../../lib/clusterNames';
import type { NodePlacement } from '../layout';
import type { NodeVisuals } from '../types';
import { NeuronNode } from './NeuronNode';
import { StarNode, STELLAR_ACCENTS } from './StarNode';

interface ThoughtNodeMeshProps {
  node: ThoughtNode;
  clusterNames?: Record<Region, string>;
  placement: NodePlacement;
  visuals: NodeVisuals;
  hovered: boolean;
  selected: boolean;
  /** A top live-search match; gets a pulsing halo ring. */
  emphasized: boolean;
  dimmed: boolean;
  interactive: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

function isLinkAttachment(attachment: ThoughtNode['attachments'][number]) {
  return /^https?:\/\//i.test(attachment.name.trim());
}

function Planet({
  attachment,
  radius,
  angle,
}: {
  attachment: ThoughtNode['attachments'][number];
  radius: number;
  angle: number;
}) {
  const [hovered, setHovered] = useState(false);
  const position: [number, number, number] = [
    Math.cos(angle) * radius,
    0,
    Math.sin(angle) * radius,
  ];
  return (
    <group>
      <mesh
        position={position}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = '';
        }}
        onClick={(event) => {
          event.stopPropagation();
          const url = attachment.name.trim();
          if (isLinkAttachment(attachment)) window.open(url, '_blank', 'noopener,noreferrer');
        }}
      >
        <sphereGeometry args={[0.24, 12, 12]} />
        <meshBasicMaterial
          color={attachment.kind === 'image' ? '#93c5fd' : '#cbd5e1'}
          transparent
          opacity={0.9}
          toneMapped={false}
        />
      </mesh>
      {hovered && (
        <Html position={position} center zIndexRange={[50, 0]} style={{ pointerEvents: 'none' }}>
          <div className="hud-panel w-max max-w-[14rem] px-2.5 py-1.5 text-left">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Attachment
            </p>
            <p className="mt-0.5 truncate text-xs font-medium text-white">{attachment.name}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{attachment.kind}</p>
          </div>
        </Html>
      )}
    </group>
  );
}

function SolarSystem({ attachments }: { attachments: ThoughtNode['attachments'] }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.55;
  });
  return (
    <group ref={group}>
      {attachments.map((attachment, index) => {
        const radius = 1.4 + index * 0.5;
        const angle = (index / Math.max(1, attachments.length)) * Math.PI * 2;
        return (
          <group key={attachment.id}>
            <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
              <torusGeometry args={[radius, 0.018, 8, 64]} />
              <meshBasicMaterial
                color={attachment.kind === 'image' ? '#93c5fd' : '#cbd5e1'}
                transparent
                opacity={0.22}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <Planet attachment={attachment} radius={radius} angle={angle} />
          </group>
        );
      })}
    </group>
  );
}

export function ThoughtNodeMesh({
  node,
  clusterNames,
  placement,
  visuals,
  hovered,
  selected,
  emphasized,
  dimmed,
  interactive,
  onHover,
  onSelect,
}: ThoughtNodeMeshProps) {
  const group = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  const ring = useRef<THREE.Mesh>(null);
  const emphasisRing = useRef<THREE.Mesh>(null);
  const emphasisMaterial = useRef<THREE.MeshBasicMaterial | null>(null);
  const meta = REGION_META[node.region];
  const accent =
    visuals.variant === 'star' ? STELLAR_ACCENTS[node.region] : meta.accent;
  const somaScale = visuals.variant === 'neuron' ? 0.72 : 1;

  const shape =
    visuals.geometry === 'icosahedron' ? (
      <icosahedronGeometry args={[1, visuals.detail]} />
    ) : visuals.geometry === 'octahedron' ? (
      <octahedronGeometry args={[1, visuals.detail]} />
    ) : (
      <sphereGeometry args={[1, 28, 28]} />
    );

  useFrame((_, delta) => {
    timeRef.current += delta;
    const target =
      placement.scale *
      (selected ? 1.5 : hovered ? 1.22 : emphasized ? 1.1 : dimmed ? 0.7 : 1);
    if (group.current) {
      const next = THREE.MathUtils.damp(group.current.scale.x, target, 9, delta);
      group.current.scale.setScalar(next);
    }
    if (ring.current) {
      ring.current.rotation.y += delta * 0.55;
      ring.current.rotation.x = Math.sin(timeRef.current * 0.35) * 0.4;
    }
    if (emphasisRing.current) {
      emphasisRing.current.rotation.z += delta * 0.8;
      const pulse = 1.8 + Math.sin(timeRef.current * 2.2) * 0.12;
      emphasisRing.current.scale.setScalar(pulse);
    }
    if (emphasisMaterial.current) {
      emphasisMaterial.current.opacity =
        0.3 + 0.18 * (0.5 + 0.5 * Math.sin(timeRef.current * 2.2));
    }
  });

  return (
    <group ref={group} position={placement.position}>
      {visuals.variant === 'star' ? (
        <StarNode
          seed={node.id}
          region={node.region}
          accent={accent}
          dimmed={dimmed}
          hovered={hovered}
          selected={selected}
          emphasized={emphasized}
        />
      ) : (
        <mesh
          scale={somaScale}
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
          {shape}

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
      )}

      {visuals.variant === 'star' && node.attachments.length > 0 && (
        <SolarSystem attachments={node.attachments} />
      )}

      {visuals.variant === 'star' && (
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
          <sphereGeometry args={[1.5, 12, 12]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            colorWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {visuals.variant === 'neuron' && (
        <NeuronNode
          seed={node.id}
          accent={accent}
          dimmed={dimmed}
          firing={hovered || selected || emphasized}
        />
      )}

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

      {visuals.variant !== 'star' && emphasized && !selected && !dimmed && (
        <mesh ref={emphasisRing} scale={1.8} raycast={() => null}>
          <torusGeometry args={[1, 0.035, 8, 64]} />
          <meshBasicMaterial
            ref={(el) => { emphasisMaterial.current = el; }}
            color={accent}
            transparent
            opacity={0.4}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {visuals.outline > 0 && (
        <mesh scale={1.015} raycast={() => null}>
          {shape}
          <meshBasicMaterial
            color={visuals.outlineColor ?? '#f8fafc'}
            wireframe
            transparent
            opacity={dimmed ? visuals.outline * 0.2 : visuals.outline}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {visuals.variant !== 'star' && selected && (
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
              {getClusterName(clusterNames, node.region)}
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
