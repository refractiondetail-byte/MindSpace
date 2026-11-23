import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { SceneEdge } from '../layout';

interface SceneEdgesProps {
  edges: SceneEdge[];
  activeIds: Set<string> | null;
  opacity: number;
  /** Overrides every edge colour (used to keep tag edges visually quieter). */
  color?: string;
  additive?: boolean;
}

/** One line-segment draw call for all connections of a given kind. */
export function SceneEdges({ edges, activeIds, opacity, color, additive = false }: SceneEdgesProps) {
  const geometry = useMemo(() => {
    const visible = activeIds
      ? edges.filter((edge) => activeIds.has(edge.fromId) && activeIds.has(edge.toId))
      : edges;

    const positions = new Float32Array(visible.length * 6);
    const colors = new Float32Array(visible.length * 6);
    const tint = new THREE.Color();

    visible.forEach((edge, index) => {
      positions.set(edge.from, index * 6);
      positions.set(edge.to, index * 6 + 3);
      tint.set(color ?? edge.color);
      colors.set([tint.r, tint.g, tint.b], index * 6);
      colors.set([tint.r, tint.g, tint.b], index * 6 + 3);
    });

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return buffer;
  }, [edges, activeIds, color]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (geometry.getAttribute('position').count === 0) return null;

  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
        toneMapped={false}
      />
    </lineSegments>
  );
}
