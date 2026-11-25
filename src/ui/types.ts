import type { ThoughtNode } from '../core/types';

export type EntryType = 'topic' | 'attachment';

export interface MindItem extends ThoughtNode {
  topic?: string;
  topicColor?: string;
  summary?: string;
  distilledNote?: string;
  extractedText?: string;
  entryType?: EntryType;
  parentId?: string | null;
  relatedIds?: string[];
  storagePath?: string | null;
}

export function asItems(nodes: ThoughtNode[]): MindItem[] {
  return nodes as MindItem[];
}