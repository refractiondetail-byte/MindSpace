import { REGION_META, type Region, type ThoughtNode } from '../core/types';

/**
 * Pure layout math for every world skin. This module never imports Three.js:
 * renderers receive plain positions and turn them into meshes.
 */

export type Vec3 = [number, number, number];

export interface RegionPlacement {
  region: Region;
  center: Vec3;
  radius: number;
}

export interface NodePlacement {
  node: ThoughtNode;
  position: Vec3;
  /** Resting radius of the node mesh before hover/selection emphasis. */
  scale: number;
}

export interface SceneEdge {
  fromId: string;
  toId: string;
  from: Vec3;
  to: Vec3;
  color: string;
}

export interface SceneLayout {
  regions: RegionPlacement[];
  placements: NodePlacement[];
  byId: Map<string, NodePlacement>;
  /** Explicit `node.links` connections. */
  linkEdges: SceneEdge[];
  /** Implicit connections between nodes that share a tag. */
  tagEdges: SceneEdge[];
}

export const CAMERA_HOME: Vec3 = [0, 15, 54];
export const CAMERA_TARGET: Vec3 = [0, 2, -1];
export const HOME_DISTANCE = 58;
export const FOCUS_DISTANCE = 13;

export const CLUSTER_RADIUS = 6.5;

/** Tetrahedral spread so all four regions read as one brain from any angle. */
const REGION_PLACEMENTS: Record<Region, { center: Vec3 }> = {
  prefrontal: { center: [0, 4, -18] },
  hippocampus: { center: [20, -3, 10] },
  limbic: { center: [-20, 1, 8] },
  parietal: { center: [-2, 16, 12] },
};

const REGION_ANGLE: Record<Region, number> = {
  prefrontal: 0.4,
  hippocampus: 2.1,
  limbic: 4.0,
  parietal: 5.4,
};

/** Deterministic 32-bit hash so a node keeps its place across renders/reloads. */
function hash(value: string): number {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(value: string): number {
  return (hash(value) % 1000) / 1000;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function placeNode(
  node: ThoughtNode,
  index: number,
  count: number,
  center: Vec3,
): Vec3 {
  const spread = count === 1 ? 0 : index / (count - 1) - 0.5;
  const y = spread * CLUSTER_RADIUS * 1.5;
  const ring = Math.sqrt(Math.max(0.08, 1 - (y / (CLUSTER_RADIUS * 1.15)) ** 2)) * CLUSTER_RADIUS;
  const angle = index * 2.3999632 + REGION_ANGLE[node.region];
  const radius = ring * (0.8 + unit(`${node.id}:radius`) * 0.22);
  const moodLift = node.moodScore === null ? 0 : node.moodScore * 0.22;

  return [
    center[0] + Math.cos(angle) * radius,
    center[1] + y + (unit(`${node.id}:y`) - 0.5) * 0.9 + moodLift,
    center[2] + Math.sin(angle) * radius,
  ];
}

function restingScale(node: ThoughtNode): number {
  const contentWeight = Math.min(1, node.content.length / 320);
  const attachmentBonus = node.attachments.length > 0 ? 0.06 : 0;
  const feelingBonus = node.type === 'feeling' ? 0.04 : 0;
  return 0.5 + contentWeight * 0.32 + attachmentBonus + feelingBonus;
}

/**
 * Builds region clusters, per-node positions and the link/tag graph.
 * Deterministic: same `ThoughtNode[]` always produces the same scene.
 */
export function buildSceneLayout(thoughts: ThoughtNode[]): SceneLayout {
  const regions: RegionPlacement[] = (Object.keys(REGION_PLACEMENTS) as Region[]).map((region) => ({
    region,
    center: REGION_PLACEMENTS[region].center,
    radius: CLUSTER_RADIUS,
  }));

  const grouped = new Map<Region, ThoughtNode[]>();
  for (const region of Object.keys(REGION_PLACEMENTS) as Region[]) grouped.set(region, []);
  for (const thought of thoughts) grouped.get(thought.region)?.push(thought);
  for (const members of grouped.values()) {
    members.sort((a, b) => `${a.createdAt}|${a.id}`.localeCompare(`${b.createdAt}|${b.id}`));
  }

  const placements: NodePlacement[] = [];
  const byId = new Map<string, NodePlacement>();

  for (const region of Object.keys(REGION_PLACEMENTS) as Region[]) {
    const members = grouped.get(region) ?? [];
    const center = REGION_PLACEMENTS[region].center;
    members.forEach((node, index) => {
      const placement: NodePlacement = {
        node,
        position: placeNode(node, index, members.length, center),
        scale: restingScale(node),
      };
      placements.push(placement);
      byId.set(node.id, placement);
    });
  }

  const linkEdges: SceneEdge[] = [];
  const seen = new Set<string>();

  for (const node of thoughts) {
    const source = byId.get(node.id);
    if (!source) continue;
    for (const targetId of node.links) {
      const target = byId.get(targetId);
      if (!target) continue;
      const key = pairKey(node.id, targetId);
      if (seen.has(key)) continue;
      seen.add(key);
      linkEdges.push({
        fromId: node.id,
        toId: targetId,
        from: source.position,
        to: target.position,
        color: REGION_META[node.region].accent,
      });
    }
  }

  // Tag connections: connect nodes that share a tag, capped per node so the
  // scene stays readable. Explicit links always win over tag edges.
  const tagBuckets = new Map<string, ThoughtNode[]>();
  for (const node of thoughts) {
    for (const tag of node.tags) {
      const bucket = tagBuckets.get(tag);
      if (bucket) bucket.push(node);
      else tagBuckets.set(tag, [node]);
    }
  }

  const tagEdges: SceneEdge[] = [];
  const degree = new Map<string, number>();
  const TAG_EDGE_LIMIT = 36;
  const TAG_DEGREE_LIMIT = 3;

  outer: for (const members of tagBuckets.values()) {
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        if (tagEdges.length >= TAG_EDGE_LIMIT) break outer;
        const a = members[i];
        const b = members[j];
        const key = pairKey(a.id, b.id);
        if (seen.has(key)) continue;
        if ((degree.get(a.id) ?? 0) >= TAG_DEGREE_LIMIT) continue;
        if ((degree.get(b.id) ?? 0) >= TAG_DEGREE_LIMIT) continue;
        const source = byId.get(a.id);
        const target = byId.get(b.id);
        if (!source || !target) continue;

        seen.add(key);
        degree.set(a.id, (degree.get(a.id) ?? 0) + 1);
        degree.set(b.id, (degree.get(b.id) ?? 0) + 1);
        tagEdges.push({
          fromId: a.id,
          toId: b.id,
          from: source.position,
          to: target.position,
          color: '#94a3b8',
        });
      }
    }
  }

  return { regions, placements, byId, linkEdges, tagEdges };
}
