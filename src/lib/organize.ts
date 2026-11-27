import { db } from '../core/db';
import { createThought, deleteThought, updateThought } from '../core/repository';
import type {
  Attachment,
  DocumentExtractionStatus,
  Region,
  ThoughtNode,
} from '../core/types';
import type { MindItem } from '../ui/types';
import {
  DEFAULT_STAR_COLOR,
  entryKind,
  starNameOf,
  unitNameOf,
  UNFILED_PLANET,
  type SolarPlanet,
  type SolarStar,
  type SolarTarget,
} from './solar';

/** Persist extra solar fields alongside the core ThoughtNode shape. */
export async function saveItem(item: MindItem): Promise<void> {
  await db.thoughts.put(item as unknown as ThoughtNode);
}

export interface EnsureStarInput {
  name: string;
  color?: string;
  existing?: SolarStar | null;
}

/** Reuse the star's node when it exists, otherwise create one. */
export async function ensureStar({ name, color, existing }: EnsureStarInput): Promise<MindItem> {
  if (existing?.id) {
    const node = await db.thoughts.get(existing.id);
    if (node) return node as MindItem;
  }
  const created = await createThought({
    title: name,
    content: '',
    type: 'note',
    region: 'hippocampus',
    tags: [name],
    moodScore: null,
  });
  const star: MindItem = {
    ...created,
    topic: name,
    topicColor: color || existing?.color || DEFAULT_STAR_COLOR,
    entryType: 'topic',
    parentId: null,
    relatedIds: [],
    extractionStatus: 'ok',
  };
  await saveItem(star);
  return star;
}

export interface EnsurePlanetInput {
  star: Pick<SolarStar, 'name' | 'color'> & { id?: string | null };
  name: string;
  color?: string;
  existing?: SolarPlanet | null;
}

/** Reuse the unit node when it exists, otherwise create one under its star. */
export async function ensurePlanet({
  star,
  name,
  color,
  existing,
}: EnsurePlanetInput): Promise<MindItem> {
  if (existing?.id) {
    const node = await db.thoughts.get(existing.id);
    if (node) return node as MindItem;
  }
  const created = await createThought({
    title: name,
    content: '',
    type: 'note',
    region: 'hippocampus',
    tags: [star.name, name],
    moodScore: null,
  });
  const planet: MindItem = {
    ...created,
    topic: star.name,
    topicColor: color || star.color || DEFAULT_STAR_COLOR,
    unit: name,
    entryType: 'unit',
    parentId: star.id ?? null,
    relatedIds: [],
  };
  await saveItem(planet);
  return planet;
}

export interface MoonDraft {
  title: string;
  star: string;
  starColor: string;
  planet: MindItem;
  unit: string;
  content: string;
  summary: string;
  distilledNote: string;
  extractedText: string;
  region?: Region;
  relatedIds?: string[];
  attachments?: Attachment[];
  storagePath?: string | null;
  extractionStatus?: DocumentExtractionStatus;
  extractionNote?: string;
  textChars?: number;
}

/** Create a Moon (document) under a Planet (unit). */
export async function createMoon(draft: MoonDraft): Promise<MindItem> {
  const created = await createThought({
    title: draft.title,
    content: draft.content,
    type: 'note',
    region: draft.region ?? 'hippocampus',
    tags: [draft.star, draft.unit],
    moodScore: null,
    attachments: draft.attachments ?? [],
  });
  const moon: MindItem = {
    ...created,
    topic: draft.star,
    topicColor: draft.starColor,
    unit: draft.unit,
    entryType: 'moon',
    parentId: draft.planet.id,
    summary: draft.summary,
    distilledNote: draft.distilledNote,
    extractedText: draft.extractedText,
    relatedIds: draft.relatedIds ?? [],
    links: draft.relatedIds ?? [],
    storagePath: draft.storagePath ?? null,
    extractionStatus: draft.extractionStatus ?? 'ok',
    extractionNote: draft.extractionNote,
    textChars: draft.textChars ?? draft.extractedText.length,
  };
  await saveItem(moon);
  return moon;
}

export interface OrganizePlan {
  starName?: string;
  starColor?: string;
  planets: Array<{ name: string; moonIds: string[] }>;
}

export interface AppliedOrganizePlan {
  star: string;
  planets: string[];
  moved: number;
}

/**
 * Apply an AI (or manual) re-organization: create missing stars/units, then
 * reparent the requested moons. Only the listed moons are touched.
 */
export async function applyOrganizePlan(
  plan: OrganizePlan,
  stars: SolarStar[],
): Promise<AppliedOrganizePlan> {
  const firstMoonId = plan.planets.flatMap((planet) => planet.moonIds)[0];
  const firstMoon = firstMoonId
    ? ((await db.thoughts.get(firstMoonId)) as MindItem | undefined)
    : undefined;
  const starName = plan.starName?.trim() || firstMoon?.topic?.trim() || 'Unsorted';
  const existingStar = stars.find((star) => star.name === starName) ?? null;
  const starNode = await ensureStar({
    name: starName,
    color: plan.starColor || existingStar?.color,
    existing: existingStar,
  });
  const starShape = { name: starName, color: starNode.topicColor || DEFAULT_STAR_COLOR, id: starNode.id };

  let moved = 0;
  const created: string[] = [];
  for (const planetPlan of plan.planets) {
    const name = planetPlan.name.trim();
    if (!name) continue;
    const existingPlanet = existingStar?.planets.find((planet) => planet.name === name) ?? null;
    const planetNode = await ensurePlanet({
      star: starShape,
      name,
      color: starShape.color,
      existing: existingPlanet,
    });
    created.push(name);
    for (const moonId of planetPlan.moonIds) {
      // eslint-disable-next-line no-await-in-loop
      const node = await db.thoughts.get(moonId);
      if (!node) continue;
      // eslint-disable-next-line no-await-in-loop
      await updateThought(moonId, {
        topic: starName,
        topicColor: starShape.color,
        unit: name,
        entryType: 'moon',
        parentId: planetNode.id,
        tags: [...new Set([starName, name, ...(node.tags ?? [])])],
      });
      moved += 1;
    }
  }

  return { star: starName, planets: created, moved };
}

/* ------------------------------------------------------- move & delete */

export interface MoveTargetResult {
  moved: number;
  /** Emptied source planets/stars that were removed after the move. */
  removedContainers: number;
}

/**
 * Relocate everything a target contains into one destination planet. Stars and
 * planets cannot nest, so moving a folder merges its moons into the chosen
 * unit; an emptied source folder is then removed from both views.
 */
export async function moveSolarTarget(
  target: SolarTarget,
  destination: { star: SolarStar; planet: SolarPlanet },
): Promise<MoveTargetResult> {
  const destinationStar = destination.star;
  const destinationPlanet = destination.planet;
  const starNode = await ensureStar({
    name: destinationStar.name,
    color: destinationStar.color,
    existing: destinationStar,
  });
  const starShape = {
    name: destinationStar.name,
    color: starNode.topicColor || destinationStar.color || DEFAULT_STAR_COLOR,
    id: starNode.id,
  };
  const planetNode = await ensurePlanet({
    star: starShape,
    name: destinationPlanet.name,
    color: destinationPlanet.color,
    existing: destinationPlanet,
  });

  const starName = destinationStar.name;
  const unitName = destinationPlanet.name;
  let moved = 0;

  for (const moon of target.items) {
    // eslint-disable-next-line no-await-in-loop
    const node = (await db.thoughts.get(moon.id)) as MindItem | undefined;
    if (!node || entryKind(node) !== 'moon') continue;
    // eslint-disable-next-line no-await-in-loop
    await updateThought(moon.id, {
      topic: starName,
      topicColor: starShape.color,
      unit: unitName,
      entryType: 'moon',
      parentId: planetNode.id,
      tags: [...new Set([starName, unitName, ...(node.tags ?? [])])],
    });
    moved += 1;
  }

  let removedContainers = 0;
  if (target.kind !== 'moon') {
    // Re-read after the writes so the emptiness check is accurate.
    const nodes = (await db.thoughts.toArray()) as MindItem[];

    if (target.kind === 'star' && target.star !== starName) {
      const stillHasMoons = nodes.some(
        (node) => entryKind(node) === 'moon' && starNameOf(node) === target.star,
      );
      if (!stillHasMoons) {
        for (const node of nodes) {
          const kind = entryKind(node);
          const isOldPlanet = kind === 'planet' && starNameOf(node) === target.star;
          const isOldStar =
            kind === 'star' &&
            (node.id === target.id ||
              node.topic?.trim() === target.star ||
              node.title.trim() === target.star);
          if ((!isOldPlanet && !isOldStar) || node.id === starNode.id) continue;
          // eslint-disable-next-line no-await-in-loop
          await deleteThought(node.id);
          removedContainers += 1;
        }
      }
    }

    if (target.kind === 'planet' && !(target.star === starName && target.planet === unitName)) {
      const sourceUnit = target.planet ?? UNFILED_PLANET;
      const stillHasMoons = nodes.some(
        (node) =>
          entryKind(node) === 'moon' &&
          starNameOf(node) === target.star &&
          unitNameOf(node) === sourceUnit,
      );
      const emptiedPlanet = nodes.find(
        (node) =>
          entryKind(node) === 'planet' &&
          (node.id === target.id ||
            (starNameOf(node) === target.star && node.title.trim() === (target.planet ?? ''))),
      );
      if (!stillHasMoons && emptiedPlanet) {
        await deleteThought(emptiedPlanet.id);
        removedContainers += 1;
      }
    }
  }

  return { moved, removedContainers };
}

/**
 * Delete a Star, Planet or Moon and everything beneath it. IndexedDB is the
 * single source of truth, so the galaxy and file system both update when the
 * live query re-runs; cloud sync picks the change up from the same list.
 */
export async function deleteSolarTarget(target: SolarTarget): Promise<number> {
  const nodes = (await db.thoughts.toArray()) as MindItem[];
  const ids = new Set<string>();
  for (const moon of target.items) ids.add(moon.id);

  if (target.kind !== 'moon') {
    for (const node of nodes) {
      const kind = entryKind(node);
      if (target.kind === 'star') {
        if (kind === 'planet' && starNameOf(node) === target.star) ids.add(node.id);
        if (
          kind === 'star' &&
          (node.id === target.id ||
            node.topic?.trim() === target.star ||
            node.title.trim() === target.star)
        ) {
          ids.add(node.id);
        }
        continue;
      }
      if (
        kind === 'planet' &&
        (node.id === target.id ||
          (starNameOf(node) === target.star && node.title.trim() === (target.planet ?? '')))
      ) {
        ids.add(node.id);
      }
    }
  }

  const existing = new Set(nodes.map((node) => node.id));
  let removed = 0;
  for (const id of ids) {
    if (!existing.has(id)) continue;
    // eslint-disable-next-line no-await-in-loop
    await deleteThought(id);
    removed += 1;
  }
  return removed;
}
