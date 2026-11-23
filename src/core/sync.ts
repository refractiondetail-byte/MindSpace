import type { ThoughtNode } from './types';

/**
 * The data layer never assumes a network. Storage is IndexedDB; cloud sync is an
 * optional adapter behind this interface so `src/core/` stays provider-agnostic.
 */
export interface RemoteChange {
  node: ThoughtNode;
  deleted: boolean;
  updatedAt: string;
}

export interface SyncPullResult {
  changes: RemoteChange[];
  cursor: string | null;
}

export interface SyncPushResult {
  accepted: number;
  cursor: string | null;
}

export interface SyncAdapter {
  readonly id: string;
  readonly label: string;
  pull(cursor: string | null): Promise<SyncPullResult>;
  push(nodes: ThoughtNode[], cursor: string | null): Promise<SyncPushResult>;
}
