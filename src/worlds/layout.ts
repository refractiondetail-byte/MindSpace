import { REGION_META, type Region, type ThoughtNode } from '../core/types';
import type { WorldTheme } from './themes';

/**
 * Pure layout math for every world skin. This module never imports Three.js:
 * renderers receive plain positions and turn them into meshes.
 *
 * Each world sculpts the same four regions differently:
 *  - brain: clusters tucked inside a twin-hemisphere cerebral shell
 *  - galaxy: one logarithmic spiral arm per region, around a central black hole
 *  - oled-void: a clean tetrahedral constellation
 */

export type Vec3 = [number, number, number];

export interface CameraView {
  home: Vec3;
  target: Vec3;
  /** Orbit distance used when flying to a node. */
  focusDistance: number;
  maxDistance: number;
}

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
  /** Quadratic Bezier control point so every connection bows as a filament. */
  control: Vec3;
  color: string;
}

export interface SceneLayout {
  world: WorldTheme;
  regions: RegionPlacement[];
  placements: NodePlacement[];
  byId: Map<string, NodePlacement>;
  /** Explicit `node.links` connections. */
  linkEdges: SceneEdge[];
  /** Implicit connections between nodes that share a tag. */
  tagEdges: SceneEdge[];
  /** Nearby same-region pairs used only for brief probing bursts. */
  probeEdges: SceneEdge[];
  camera: CameraView;
}

/** Shared by the brain shell geometry and the node-framing clamp. */
export const BRAIN_RADII: Vec3 = [22, 17, 29];

export const GALAXY_SHAPE = {
  arms: 4,
  inner: 20,
  outer: 84,
  /** Total angle swept by one arm, in radians. */
  span: 5.4,
  start: 0.62,
  thickness: 5.6,
} as const;

export const WORLD_CAMERAS: Record<WorldTheme, CameraView> = {
  galaxy: { home: [0, 42, 86], target: [0, 0, 0], focusDistance: 10, maxDistance: 320 },
};

export const REGION_ORDER: Region[] = ['prefrontal', 'parietal', 'limbic', 'hippocampus'];

const NODE_SCALE: Record<WorldTheme, number> = {
  galaxy: 1.15,
};

/** Deterministic 32-bit hash so a node keeps its place across renders/reloads. */
function hashValue(value: string): number {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(value: string): number {
  return (hashValue(value) % 1000) / 1000;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/* ----------------------------------------------------------------- galaxy */

export function galaxyArmAngle(t: number, arm: number): number {
  return (
    GALAXY_SHAPE.start +
    (arm * Math.PI * 2) / GALAXY_SHAPE.arms +
    t * GALAXY_SHAPE.span
  );
}

export function galaxyArmRadius(t: number): number {
  const growth = Math.log(GALAXY_SHAPE.outer / GALAXY_SHAPE.inner) / GALAXY_SHAPE.span;
  return GALAXY_SHAPE.inner * Math.exp(growth * t * GALAXY_SHAPE.span);
}

function galaxyPoint(t: number, arm: number, seed: string): Vec3 {
  const angle = galaxyArmAngle(t, arm);
  const radius = galaxyArmRadius(t) + (unit(`${seed}:radius`) - 0.5) * 2.6;
  const depth =
    (unit(`${seed}:depth`) - 0.5) * GALAXY_SHAPE.thickness * (1 - 0.3 * t);
  return [Math.cos(angle) * radius, depth, Math.sin(angle) * radius];
}

/* -------------------------------------------------------------- placement */



function restingScale(node: ThoughtNode): number {
  const contentWeight = Math.min(1, node.content.length / 320);
  const attachmentBonus = node.attachments.length > 0 ? 0.06 : 0;
  const feelingBonus = node.type === 'feeling' ? 0.04 : 0;
  return 0.5 + contentWeight * 0.32 + attachmentBonus + feelingBonus;
}

interface Scaffold {
  regions: RegionPlacement[];
  position: (
    node: ThoughtNode,
    index: number,
    count: number,
    region: Region,
  ) => Vec3;
}

function galaxyScaffold(): Scaffold {
  return {
    regions: REGION_ORDER.map((region) => ({
      region,
      center: galaxyPoint(0.58, REGION_ORDER.indexOf(region), `region:${region}`),
      radius: 2.6,
    })),
    position: (node, index, count, region) => {
      const base = count === 1 ? 0.55 : 0.15 + 0.72 * (index / (count - 1));
      const t = Math.min(1, Math.max(0, base + (unit(`${node.id}:arm`) - 0.5) * 0.06));
      return galaxyPoint(t, REGION_ORDER.indexOf(region), node.id);
    },
  };
}

/* ------------------------------------------------------------------- graph */

/** Bows each filament sideways plus away from the scene centre. */
function edgeControl(from: Vec3, to: Vec3, seed: string): Vec3 {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz) || 1;
  const mid: Vec3 = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ];

  // Perpendicular to the chord in the horizontal plane.
  let px = -dz;
  let pz = dx;
  const planar = Math.hypot(px, pz) || 1;
  px /= planar;
  pz /= planar;

  const side = unit(`${seed}:side`) > 0.5 ? 1 : -1;
  const radial = Math.hypot(mid[0], mid[1], mid[2]);
  const outward: Vec3 =
    radial > 0.001 ? [mid[0] / radial, mid[1] / radial, mid[2] / radial] : [0, 1, 0];

  const bow = length * 0.17 * side;
  const push = length * 0.12;

  return [
    mid[0] + px * bow + outward[0] * push,
    mid[1] + outward[1] * push + length * 0.03,
    mid[2] + pz * bow + outward[2] * push,
  ];
}

function buildEdges(
  thoughts: ThoughtNode[],
  byId: Map<string, NodePlacement>,
): Pick<SceneLayout, 'linkEdges' | 'tagEdges'> {
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
        control: edgeControl(source.position, target.position, key),
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
          control: edgeControl(source.position, target.position, key),
          color: '#8b93a7',
        });
      }
    }
  }

  return { linkEdges, tagEdges };
}

/**
 * Candidate connections: nearby nodes in the same region that are not already
 * linked. They are drawn faintly and only spark occasionally, so the graph
 * looks like it is actively testing new associations.
 */
function buildProbeEdges(
  thoughts: ThoughtNode[],
  byId: Map<string, NodePlacement>,
  connected: Set<string>,
  maxDistance: number,
  allowCrossRegion: boolean,
): SceneEdge[] {
  const candidates: { a: ThoughtNode; b: ThoughtNode; distance: number }[] = [];

  for (let i = 0; i < thoughts.length; i += 1) {
    for (let j = i + 1; j < thoughts.length; j += 1) {
      const a = thoughts[i];
      const b = thoughts[j];
      if (!allowCrossRegion && a.region !== b.region) continue;
      if (connected.has(pairKey(a.id, b.id))) continue;

      const source = byId.get(a.id);
      const target = byId.get(b.id);
      if (!source || !target) continue;

      const distance = Math.hypot(
        target.position[0] - source.position[0],
        target.position[1] - source.position[1],
        target.position[2] - source.position[2],
      );
      if (distance > maxDistance) continue;
      candidates.push({ a, b, distance });
    }
  }

  candidates.sort((left, right) => left.distance - right.distance);

  const result: SceneEdge[] = [];
  const degree = new Map<string, number>();
  const LIMIT = 24;
  const DEGREE_LIMIT = 2;

  for (const { a, b } of candidates) {
    if (result.length >= LIMIT) break;
    if ((degree.get(a.id) ?? 0) >= DEGREE_LIMIT) continue;
    if ((degree.get(b.id) ?? 0) >= DEGREE_LIMIT) continue;

    const source = byId.get(a.id);
    const target = byId.get(b.id);
    if (!source || !target) continue;

    degree.set(a.id, (degree.get(a.id) ?? 0) + 1);
    degree.set(b.id, (degree.get(b.id) ?? 0) + 1);
    result.push({
      fromId: a.id,
      toId: b.id,
      from: source.position,
      to: target.position,
      control: edgeControl(source.position, target.position, pairKey(a.id, b.id)),
      color: REGION_META[a.region].accent,
    });
  }

  return result;
}

/**
 * Builds the world-specific region scaffolds, per-node positions and the
 * curved link/tag graph. Deterministic: same thoughts always produce the same
 * scene for a given world.
 */
export function buildSceneLayout(
  thoughts: ThoughtNode[],
  world: WorldTheme = 'galaxy',
): SceneLayout {
  const scaffold = galaxyScaffold();

  const grouped = new Map<Region, ThoughtNode[]>();
  for (const region of REGION_ORDER) grouped.set(region, []);
  for (const thought of thoughts) grouped.get(thought.region)?.push(thought);
  for (const members of grouped.values()) {
    members.sort((a, b) =>
      `${a.createdAt}|${a.id}`.localeCompare(`${b.createdAt}|${b.id}`),
    );
  }

  const placements: NodePlacement[] = [];
  const byId = new Map<string, NodePlacement>();

  for (const region of REGION_ORDER) {
    const members = grouped.get(region) ?? [];
    members.forEach((node, index) => {
      const placement: NodePlacement = {
        node,
        position: scaffold.position(node, index, members.length, region),
        scale: restingScale(node) * NODE_SCALE[world],
      };
      placements.push(placement);
      byId.set(node.id, placement);
    });
  }

  const { linkEdges, tagEdges } = buildEdges(thoughts, byId);
  const connected = new Set<string>();
  for (const edge of [...linkEdges, ...tagEdges]) {
    connected.add(pairKey(edge.fromId, edge.toId));
  }
  const probeEdges = buildProbeEdges(
    thoughts,
    byId,
    connected,
    world === 'galaxy' ? 64 : 12,
    world === 'galaxy',
  );

  return {
    world,
    regions: scaffold.regions,
    placements,
    byId,
    linkEdges,
    tagEdges,
    probeEdges,
    camera: WORLD_CAMERAS[world],
  };
}
