import type { SceneLayout } from '../layout';
import type { NodeVisuals } from '../types';
import { ThoughtNodeMesh } from './ThoughtNodeMesh';

interface SceneNodesProps {
  layout: SceneLayout;
  visuals: NodeVisuals;
  activeIds: Set<string> | null;
  selectedId: string | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

export function SceneNodes({
  layout,
  visuals,
  activeIds,
  selectedId,
  hoveredId,
  onHover,
  onSelect,
}: SceneNodesProps) {
  return (
    <>
      {layout.placements.map((placement) => {
        const { node } = placement;
        const selected = node.id === selectedId;
        const dimmed = activeIds !== null && !activeIds.has(node.id) && !selected;
        return (
          <ThoughtNodeMesh
            key={node.id}
            node={node}
            placement={placement}
            visuals={visuals}
            hovered={node.id === hoveredId}
            selected={selected}
            dimmed={dimmed}
            interactive={!dimmed}
            onHover={onHover}
            onSelect={onSelect}
          />
        );
      })}
    </>
  );
}
