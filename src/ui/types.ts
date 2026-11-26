import type { DocumentExtractionStatus, SolarRole, ThoughtNode } from '../core/types';

/** Solar role of the node; `attachment` is the legacy pre-hierarchy label. */
export type EntryType = SolarRole;

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
  /** Whether the document's text layer could actually be read. */
  extractionStatus?: DocumentExtractionStatus;
  extractionNote?: string;
  textChars?: number;
}

export function asItems(nodes: ThoughtNode[]): MindItem[] {
  return nodes as MindItem[];
}
