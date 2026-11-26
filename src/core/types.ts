/**
 * MindSpace core domain model.
 *
 * This file is pure TypeScript on purpose: no React, no Three.js, no UI imports.
 * Every world skin and every UI surface reads the same `ThoughtNode` shape.
 */

export const REGIONS = ['prefrontal', 'hippocampus', 'limbic', 'parietal'] as const;

export type Region = (typeof REGIONS)[number];

export interface RegionMeta {
  id: Region;
  label: string;
  description: string;
  /** Accent colour used by UI/world layers so skins stay visually consistent. */
  accent: string;
}

export const REGION_META: Record<Region, RegionMeta> = {
  prefrontal: {
    id: 'prefrontal',
    label: 'Prefrontal',
    description: 'Plans, goals, motivation',
    accent: '#a78bfa',
  },
  hippocampus: {
    id: 'hippocampus',
    label: 'Hippocampus',
    description: 'Schoolwork, notes, files',
    accent: '#38bdf8',
  },
  limbic: {
    id: 'limbic',
    label: 'Limbic',
    description: 'Mood, feelings, reflections',
    accent: '#fb7185',
  },
  parietal: {
    id: 'parietal',
    label: 'Parietal',
    description: 'Projects, ideas',
    accent: '#34d399',
  },
};

export const THOUGHT_TYPES = ['thought', 'feeling', 'note'] as const;

export type ThoughtType = (typeof THOUGHT_TYPES)[number];

export type AttachmentKind = 'image' | 'file';

/**
 * Outcome of reading a document's text layer (PDF/DOCX/PPTX/TXT/image).
 * Stored on the node so the AI can be told—and the UI can show—when a file's
 * contents could not be read, instead of inventing them.
 */
export type DocumentExtractionStatus = 'ok' | 'empty' | 'unsupported' | 'error';

/**
 * Attachment metadata lives on the node; the binary itself is stored in the
 * separate `attachments` IndexedDB table (see `db.ts`) keyed by this same id.
 */
export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  createdAt: string;
}

export interface ThoughtNode {
  id: string;
  title: string;
  content: string;
  type: ThoughtType;
  region: Region;
  tags: string[];
  attachments: Attachment[];
  /** -5 (very low) … +5 (very high); null when mood is not tracked. */
  moodScore: number | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** Ids of related ThoughtNodes. */
  links: string[];
}

/**
 * Solar-system role of a node. The HUD/3D scene maps these to
 * Star (topic) → Planet (unit) → Moon (document).
 * `attachment` is the legacy pre-hierarchy label and reads as `moon`.
 */
export type SolarRole = 'topic' | 'unit' | 'moon' | 'attachment';

/** Shape accepted when creating a node; storage/factory fills the rest. */
export interface ThoughtDraft {
  title?: string;
  content?: string;
  type: ThoughtType;
  region: Region;
  tags?: string[];
  moodScore?: number | null;
  links?: string[];
  attachments?: Attachment[];
}

export const MOOD_MIN = -5;
export const MOOD_MAX = 5;

export function clampMoodScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.min(MOOD_MAX, Math.max(MOOD_MIN, Math.round(score)));
}

export function isRegion(value: string): value is Region {
  return (REGIONS as readonly string[]).includes(value);
}

export function isThoughtType(value: string): value is ThoughtType {
  return (THOUGHT_TYPES as readonly string[]).includes(value);
}
