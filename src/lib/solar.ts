import type { DocumentExtractionStatus } from '../core/types';
import type { MindItem } from '../ui/types';

/**
 * Solar-system hierarchy for MindSpace:
 *   Star (Topic) → Planet (Unit) → Moon (document/file)
 *
 * Everything here is pure data shaping: it reads nodes and produces the three
 * levels the HUD, the 3D galaxy and the AI chat all agree on.
 */

export type SolarKind = 'star' | 'planet' | 'moon';

export const STAR_NODE_ROLE = 'topic';
export const UNIT_NODE_ROLE = 'unit';
export const MOON_NODE_ROLE = 'moon';

export const UNFILED_STAR = 'Unsorted';
export const UNFILED_PLANET = 'General';
export const DEFAULT_STAR_COLOR = '#c6d6e8';

/** Stable key for a planet, used by the 3D scene and focus requests. */
export function planetKey(star: string, planet: string): string {
  return `${star.trim()}|${planet.trim()}`;
}

export function starNameOf(item: MindItem): string {
  const topic = item.topic?.trim();
  if (topic) return topic;
  // Older nodes only carried the topic inside `tags`.
  const tag = item.tags?.find((entry) => entry.trim().length > 0);
  return tag?.trim() || UNFILED_STAR;
}

export function unitNameOf(item: MindItem): string {
  const unit = item.unit?.trim();
  return unit || UNFILED_PLANET;
}

/**
 * Role of a node. Legacy `attachment` counts as a moon, and a legacy `topic`
 * node that still carries its own file is treated as that file's moon.
 */
export function entryKind(item: MindItem): SolarKind {
  if (item.entryType === UNIT_NODE_ROLE) return 'planet';
  if (item.entryType === STAR_NODE_ROLE) {
    return item.attachments.length === 0 && !item.parentId ? 'star' : 'moon';
  }
  return 'moon';
}

export interface SolarPlanet {
  /** `star|unit` — stable even when no unit node exists yet. */
  key: string;
  /** Node id of the unit, or null for a synthetic planet from legacy data. */
  id: string | null;
  star: string;
  name: string;
  color: string;
  summary?: string;
  moons: MindItem[];
}

export interface SolarStar {
  name: string;
  color: string;
  /** Node id of the star, or null when it only exists implicitly. */
  id: string | null;
  planets: SolarPlanet[];
  moonCount: number;
}

export function buildSolarSystem(items: MindItem[]): SolarStar[] {
  const stars = new Map<string, SolarStar>();
  const planets = new Map<string, SolarPlanet>();
  const planetById = new Map<string, SolarPlanet>();

  const ensureStar = (name: string, color?: string): SolarStar => {
    const existing = stars.get(name);
    if (existing) {
      if (color && existing.color === DEFAULT_STAR_COLOR) existing.color = color;
      return existing;
    }
    const star: SolarStar = {
      name,
      color: color || DEFAULT_STAR_COLOR,
      id: null,
      planets: [],
      moonCount: 0,
    };
    stars.set(name, star);
    return star;
  };

  const ensurePlanet = (
    star: SolarStar,
    name: string,
    options: { id?: string | null; color?: string; summary?: string } = {},
  ): SolarPlanet => {
    const key = planetKey(star.name, name);
    const existing = planets.get(key);
    if (existing) {
      if (options.id && !existing.id) existing.id = options.id;
      if (options.color && existing.color === star.color) existing.color = options.color;
      if (options.summary && !existing.summary) existing.summary = options.summary;
      return existing;
    }
    const planet: SolarPlanet = {
      key,
      id: options.id ?? null,
      star: star.name,
      name,
      color: options.color || star.color,
      summary: options.summary,
      moons: [],
    };
    planets.set(key, planet);
    star.planets.push(planet);
    if (planet.id) planetById.set(planet.id, planet);
    return planet;
  };

  // Pass 1: explicit star nodes.
  for (const item of items) {
    if (entryKind(item) !== 'star') continue;
    const name = item.topic?.trim() || item.title.trim() || UNFILED_STAR;
    const star = ensureStar(name, item.topicColor);
    star.id = item.id;
    if (!item.topicColor && star.color === DEFAULT_STAR_COLOR) star.color = item.topicColor || star.color;
  }

  // Pass 2: unit nodes become planets even before any document exists.
  for (const item of items) {
    if (entryKind(item) !== 'planet') continue;
    const star = ensureStar(starNameOf(item), item.topicColor);
    ensurePlanet(star, item.title.trim() || UNFILED_PLANET, {
      id: item.id,
      color: item.topicColor,
      summary: item.summary,
    });
  }

  // Pass 3: documents become moons of their unit.
  for (const item of items) {
    if (entryKind(item) !== 'moon') continue;
    const star = ensureStar(starNameOf(item), item.topicColor);
    const parentPlanet = item.parentId ? planetById.get(item.parentId) : undefined;
    const planet = parentPlanet ?? ensurePlanet(star, unitNameOf(item), { color: item.topicColor });
    planet.moons.push(item);
    star.moonCount += 1;
    if (star.id && !star.color) star.color = item.topicColor || DEFAULT_STAR_COLOR;
  }

  for (const star of stars.values()) {
    star.planets.sort(
      (a, b) => b.moons.length - a.moons.length || a.name.localeCompare(b.name),
    );
    for (const planet of star.planets) {
      planet.moons.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (!planet.summary) {
        planet.summary = planet.moons[0]?.summary;
      }
    }
  }

  return [...stars.values()].sort(
    (a, b) => b.moonCount - a.moonCount || a.name.localeCompare(b.name),
  );
}

export function findStar(stars: SolarStar[], name: string | null | undefined): SolarStar | null {
  if (!name) return null;
  return stars.find((star) => star.name === name) ?? null;
}

export function findPlanet(
  stars: SolarStar[],
  starName: string | null | undefined,
  planetName: string | null | undefined,
): SolarPlanet | null {
  const star = findStar(stars, starName);
  if (!star || !planetName) return null;
  return star.planets.find((planet) => planet.name === planetName) ?? null;
}

/** Where a document sits, for opening its star/planet after a camera flight. */
export interface MoonLocation {
  star: string;
  planet: string;
  moonId: string;
}

export function locateMoon(stars: SolarStar[], moonId: string): MoonLocation | null {
  for (const star of stars) {
    for (const planet of star.planets) {
      if (planet.moons.some((moon) => moon.id === moonId)) {
        return { star: star.name, planet: planet.name, moonId };
      }
    }
  }
  return null;
}

export function moonCount(stars: SolarStar[]): number {
  return stars.reduce((total, star) => total + star.moonCount, 0);
}

/* ------------------------------------------------------------- targets */

/** Which level of the Star → Planet → Moon hierarchy an action applies to. */
export type SolarTargetKind = 'star' | 'planet' | 'moon';

/**
 * A view-agnostic selection. Both the 3D galaxy and the file system hand the
 * same shape to the context menu, dialogs and AI tools, so an action behaves
 * identically no matter where it was invoked.
 */
export interface SolarTarget {
  kind: SolarTargetKind;
  /** Star (topic) name. */
  star: string;
  starColor: string;
  /** Planet (unit) name for planets and moons. */
  planet?: string;
  planetColor?: string;
  /** Node id of the star/planet/moon, or null when the container is implicit. */
  id: string | null;
  title: string;
  color: string;
  /** Moons this target contains (exactly one for a moon). */
  items: MindItem[];
}

export function targetFromStar(star: SolarStar): SolarTarget {
  return {
    kind: 'star',
    star: star.name,
    starColor: star.color,
    id: star.id,
    title: star.name,
    color: star.color,
    items: star.planets.flatMap((planet) => planet.moons),
  };
}

export function targetFromPlanet(planet: SolarPlanet): SolarTarget {
  return {
    kind: 'planet',
    star: planet.star,
    starColor: planet.color,
    planet: planet.name,
    planetColor: planet.color,
    id: planet.id,
    title: planet.name,
    color: planet.color,
    items: planet.moons,
  };
}

export function targetFromMoon(moon: MindItem, fallbackPlanet?: SolarPlanet | null): SolarTarget {
  const star = moon.topic?.trim() || starNameOf(moon);
  const unit = moon.unit?.trim() || fallbackPlanet?.name || unitNameOf(moon);
  const color = moon.topicColor || fallbackPlanet?.color || DEFAULT_STAR_COLOR;
  return {
    kind: 'moon',
    star,
    starColor: color,
    planet: unit,
    planetColor: fallbackPlanet?.color || color,
    id: moon.id,
    title: moon.title,
    color,
    items: [moon],
  };
}

export function targetKindLabel(kind: SolarTargetKind): string {
  if (kind === 'star') return 'Star';
  if (kind === 'planet') return 'Planet';
  return 'Moon';
}

/** Breadcrumb-style path shown in menus and dialogs. */
export function targetPath(target: SolarTarget): string {
  if (target.kind === 'star') return 'Galaxy Root';
  if (target.kind === 'planet') return `Galaxy Root / ${target.star}`;
  return `Galaxy Root / ${target.star} / ${target.planet ?? UNFILED_PLANET}`;
}

/** Compact moon index shared by the AI chat and the AI move action. */
export function buildChatIndex(
  stars: SolarStar[],
  limit = 120,
): Array<{
  id: string;
  title: string;
  star: string;
  planet: string;
  status: DocumentExtractionStatus;
}> {
  return stars
    .flatMap((star) =>
      star.planets.flatMap((planet) =>
        planet.moons.map((moon) => ({
          id: moon.id,
          title: moon.title,
          star: star.name,
          planet: planet.name,
          status: moon.extractionStatus ?? ('ok' as const),
        })),
      ),
    )
    .slice(0, limit);
}
