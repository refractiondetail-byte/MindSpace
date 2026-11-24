import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Region, ThoughtNode } from '../core/types';
import { CameraController, type CameraFocus } from './components/CameraController';
import { buildSceneLayout } from './layout';
import { WORLD_RENDERERS } from './index';
import type { WorldTheme } from './themes';

const GL_SETTINGS = {
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance' as const,
};

export interface WorldFocusRequest {
  /** `null` requests the home view. */
  nodeId: string | null;
  token: number;
}

interface WorldCanvasProps {
  thoughts: ThoughtNode[];
  themeId: WorldTheme;
  clusterNames?: Record<Region, string>;
  selectedId: string | null;
  activeIds: Set<string> | null;
  emphasisIds: Set<string> | null;
  focus: WorldFocusRequest | null;
  onSelect: (id: string) => void;
  onSelectBlackHole?: () => void;
  homeMode?: boolean;
  tilt?: number;
}

/**
 * Full-screen 3D stage. Keeps hover state local so pointing at a node never
 * re-renders the HUD, and rebuilds the arrangement whenever the world changes.
 */
export function WorldCanvas({
  thoughts,
  themeId,
  clusterNames,
  selectedId,
  activeIds,
  emphasisIds,
  focus,
  onSelect,
  onSelectBlackHole,
  homeMode = false,
  tilt = 0,
}: WorldCanvasProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const layout = useMemo(
    () => buildSceneLayout(thoughts, themeId),
    [thoughts, themeId],
  );
  const Renderer = WORLD_RENDERERS[themeId];

  const cameraFocus = useMemo<CameraFocus | null>(() => {
    if (!focus) return null;
    if (focus.nodeId === null) return { position: null, token: focus.token };
    const placement = layout.byId.get(focus.nodeId);
    // A just-created node is not in the layout until the live query refreshes;
    // return no request rather than an unintended flight home.
    if (!placement) return null;
    const [x, y, z] = placement.position;
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    const rotated: [number, number, number] = [x, y * cos - z * sin, y * sin + z * cos];
    return { position: rotated, token: focus.token };
  }, [focus, layout]);

  useEffect(() => {
    if (hoveredId && !layout.byId.has(hoveredId)) setHoveredId(null);
  }, [layout, hoveredId]);

  useEffect(() => {
    document.body.style.cursor = hoveredId ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hoveredId]);

  return (
    <Canvas
      dpr={[1, 2]}
      gl={GL_SETTINGS}
      camera={{
        position: layout.camera.home,
        fov: 50,
        near: 0.1,
        far: 400,
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <CameraController focus={cameraFocus} view={layout.camera} />
      <group rotation={[tilt, 0, 0]}>
        <Renderer
          layout={layout}
          clusterNames={clusterNames}
          selectedId={selectedId}
          onSelectBlackHole={onSelectBlackHole}
          homeMode={homeMode}
          hoveredId={hoveredId}
          activeIds={activeIds}
          emphasisIds={emphasisIds}
          onHover={setHoveredId}
          onSelect={onSelect}
        />
      </group>
    </Canvas>
  );
}
