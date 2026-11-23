import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ThoughtNode } from '../core/types';
import { CameraController, type CameraFocus } from './components/CameraController';
import { buildSceneLayout, CAMERA_HOME } from './layout';
import { WORLD_RENDERERS } from './index';
import type { WorldTheme } from './themes';

const CAMERA_SETTINGS = {
  position: CAMERA_HOME,
  fov: 50,
  near: 0.1,
  far: 400,
};

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
  selectedId: string | null;
  activeIds: Set<string> | null;
  focus: WorldFocusRequest | null;
  onSelect: (id: string) => void;
}

/**
 * Full-screen 3D stage. Keeps hover state local so pointing at a node never
 * re-renders the HUD.
 */
export function WorldCanvas({
  thoughts,
  themeId,
  selectedId,
  activeIds,
  focus,
  onSelect,
}: WorldCanvasProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const layout = useMemo(() => buildSceneLayout(thoughts), [thoughts]);
  const Renderer = WORLD_RENDERERS[themeId];

  const cameraFocus = useMemo<CameraFocus | null>(() => {
    if (!focus) return null;
    if (focus.nodeId === null) return { position: null, token: focus.token };
    const placement = layout.byId.get(focus.nodeId);
    // A just-created node is not in the layout until the live query refreshes;
    // return no request rather than an unintended flight home.
    if (!placement) return null;
    return { position: placement.position, token: focus.token };
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
      camera={CAMERA_SETTINGS}
      style={{ position: 'absolute', inset: 0 }}
    >
      <CameraController focus={cameraFocus} />
      <Renderer
        layout={layout}
        selectedId={selectedId}
        hoveredId={hoveredId}
        activeIds={activeIds}
        onHover={setHoveredId}
        onSelect={onSelect}
      />
    </Canvas>
  );
}
