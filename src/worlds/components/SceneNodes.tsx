import type { Region } from '../../core/types';
import type { SceneLayout } from '../layout';
import type { NodeVisuals } from '../types';
import { ThoughtNodeMesh } from './ThoughtNodeMesh';

interface SceneNodesProps {
  layout: SceneLayout;
  clusterNames?: Record<Region, string>;
  visuals: NodeVisuals;
  activeIds: Set<string> | null;
  emphasisIds: Set<string> | null;
  selectedId: string | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

export function SceneNodes({
  layout,
  clusterNames,
  visuals,
  activeIds,
  emphasisIds,
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
            clusterNames={clusterNames}
            placement={placement}
            visuals={visuals}
            hovered={node.id === hoveredId}
            selected={selected}
            emphasized={emphasisIds?.has(node.id) ?? false}
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
