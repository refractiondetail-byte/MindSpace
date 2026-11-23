import { db, initDatabase } from './db';
import { clampMoodScore, type Attachment, type ThoughtDraft, type ThoughtNode } from './types';

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeTags(tags: string[]): string[] {
  const unique = new Set<string>();
  for (const tag of tags) {
    const clean = tag.trim().replace(/^#+/, '').toLowerCase();
    if (clean.length > 0) unique.add(clean);
  }
  return [...unique];
}

/**
 * Newest first. Strictly read-only: safe to call inside `useLiveQuery`.
 * Seeding happens once at startup via `initDatabase()`.
 */
export async function listThoughts(): Promise<ThoughtNode[]> {
  return db.thoughts.orderBy('createdAt').reverse().toArray();
}

/** Strictly read-only: safe to call inside `useLiveQuery`. */
export async function countThoughts(): Promise<number> {
  return db.thoughts.count();
}

export async function createThought(draft: ThoughtDraft): Promise<ThoughtNode> {
  await initDatabase();

  const content = draft.content?.trim() ?? '';
  const title = draft.title?.trim() || content.split('\n')[0]?.slice(0, 80).trim() || 'Untitled node';
  const moodScore =
    draft.moodScore === undefined || draft.moodScore === null ? null : clampMoodScore(draft.moodScore);

  const node: ThoughtNode = {
    id: createId(),
    title,
    content,
    type: draft.type,
    region: draft.region,
    tags: normalizeTags(draft.tags ?? []),
    attachments: draft.attachments ?? [],
    moodScore,
    createdAt: new Date().toISOString(),
    links: draft.links ?? [],
  };

  await db.thoughts.add(node);
  return node;
}

export async function linkThoughts(sourceId: string, targetId: string): Promise<void> {
  const node = await db.thoughts.get(sourceId);
  if (!node || node.links.includes(targetId)) return;
  await db.thoughts.put({ ...node, links: [...node.links, targetId] });
}

/** Stores the file binary in IndexedDB and attaches its metadata to the node. */
export async function addAttachment(thoughtId: string, file: File): Promise<Attachment> {
  const mimeType = file.type || 'application/octet-stream';
  const attachment: Attachment = {
    id: createId(),
    name: file.name || 'untitled',
    mimeType,
    size: file.size,
    kind: mimeType.startsWith('image/') ? 'image' : 'file',
    createdAt: new Date().toISOString(),
  };
  const blob = file.slice(0, file.size, mimeType);

  await db.transaction('rw', db.thoughts, db.attachments, async () => {
    const node = await db.thoughts.get(thoughtId);
    if (!node) throw new Error(`Thought ${thoughtId} no longer exists`);
    await db.attachments.put({ id: attachment.id, thoughtId, blob });
    await db.thoughts.put({ ...node, attachments: [...node.attachments, attachment] });
  });

  return attachment;
}

export async function getAttachmentBlob(attachmentId: string): Promise<Blob | undefined> {
  const stored = await db.attachments.get(attachmentId);
  return stored?.blob;
}

export async function deleteThought(id: string): Promise<void> {
  await db.transaction('rw', db.thoughts, db.attachments, async () => {
    await db.attachments.where('thoughtId').equals(id).delete();
    await db.thoughts.delete(id);
  });
}
