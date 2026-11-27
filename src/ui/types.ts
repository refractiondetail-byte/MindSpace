import type { DocumentExtractionStatus, SolarRole, ThoughtNode } from '../core/types';

/** Solar role of the node; `attachment` is the legacy pre-hierarchy label. */
export type EntryType = SolarRole;

/**
 * Context handed to the assistant when a Star, Planet or Moon is sent to chat.
 * The `token` lets the chat open itself exactly once per request.
 */
export interface AiBinding {
  token: number;
  /** Short header label, e.g. `★ Calculus II · 12 moons`. */
  label: string;
  title: string;
  text?: string;
  status?: DocumentExtractionStatus;
  note?: string;
}

export interface MindItem extends ThoughtNode {
  /** Star (topic) name this node belongs to. */
  topic?: string;
  topicColor?: string;
  summary?: string;
  distilledNote?: string;
  extractedText?: string;
  entryType?: EntryType;
  parentId?: string | null;
  /** Planet (unit) name for moons. */
  unit?: string;
  relatedIds?: string[];
  storagePath?: string | null;
  /** Link the moon was captured from (e.g. a Google Slides presentation). */
  sourceUrl?: string | null;
  /** Whether the document's text layer could actually be read. */
  extractionStatus?: DocumentExtractionStatus;
  extractionNote?: string;
  textChars?: number;
}

export function asItems(nodes: ThoughtNode[]): MindItem[] {
  return nodes as MindItem[];
}
