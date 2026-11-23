import Dexie, { type Table } from 'dexie';
import { SEED_THOUGHTS } from './seed';
import type { ThoughtNode } from './types';

/** Binary payload for a node attachment, kept out of the node record. */
export interface StoredAttachment {
  id: string;
  thoughtId: string;
  blob: Blob;
}

interface MetaRecord {
  key: string;
  value: string;
}

const DATABASE_NAME = 'mindspace';
const SEED_FLAG = 'seeded:v1';

class MindSpaceDatabase extends Dexie {
  thoughts!: Table<ThoughtNode, string>;
  attachments!: Table<StoredAttachment, string>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super(DATABASE_NAME);
    this.version(1).stores({
      thoughts: 'id, type, region, createdAt, moodScore, *tags',
      attachments: 'id, thoughtId',
      meta: 'key',
    });
  }
}

export const db = new MindSpaceDatabase();

let initialization: Promise<void> | null = null;

/**
 * Opens the database and seeds the four brain regions exactly once.
 *
 * Startup only: this writes, so it must never be awaited from a query that
 * runs inside `useLiveQuery` / `liveQuery` (that context is a read-only
 * IndexedDB transaction and would throw ReadOnlyError).
 *
 * Safe to call repeatedly; the work is memoised and retried after a failure.
 */
export function initDatabase(): Promise<void> {
  initialization ??= openAndSeed().catch((error: unknown) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

async function openAndSeed(): Promise<void> {
  await db.open();
  if (await db.meta.get(SEED_FLAG)) return;

  await db.transaction('rw', db.thoughts, db.meta, async () => {
    // Re-check inside the transaction so concurrent callers seed only once.
    if (await db.meta.get(SEED_FLAG)) return;
    if ((await db.thoughts.count()) === 0) {
      await db.thoughts.bulkAdd(SEED_THOUGHTS);
    }
    await db.meta.put({ key: SEED_FLAG, value: new Date().toISOString() });
  });
}
