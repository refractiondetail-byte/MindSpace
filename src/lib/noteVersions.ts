import { supabase } from './supabase';
import type { MindItem } from '../ui/types';

export interface NoteVersion {
  id: string;
  nodeId: string;
  createdAt: string;
  title: string;
  content: string;
  topic?: string;
  topicColor?: string;
  distilledNote?: string;
  summary?: string;
  extractedText?: string;
  relatedIds?: string[];
  entryType?: MindItem['entryType'];
  parentId?: string | null;
}

const STORAGE_KEY = 'mindspace.noteVersions';

function readLocal(): NoteVersion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NoteVersion[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(versions: NoteVersion[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(versions.slice(0, 200)));
  } catch {
    // ignore quota errors
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function recordNoteVersion(item: MindItem): Promise<void> {
  const version: NoteVersion = {
    id: `${item.id}-${Date.now()}`,
    nodeId: item.id,
    createdAt: new Date().toISOString(),
    title: item.title,
    content: item.content,
    topic: item.topic,
    topicColor: item.topicColor,
    distilledNote: item.distilledNote,
    summary: item.summary,
    extractedText: item.extractedText,
    relatedIds: item.relatedIds ?? item.links,
    entryType: item.entryType,
    parentId: item.parentId,
  };

  const local = readLocal();
  local.unshift(version);
  writeLocal(local);

  if (!supabase) return;
  try {
    const userId = await getCurrentUserId();
    await supabase.from('note_versions').insert({
      node_id: item.id,
      user_id: userId,
      version: version,
      created_at: version.createdAt,
    });
  } catch (error) {
    console.warn('note_versions table unavailable, using local fallback:', error);
  }
}

export async function listNoteVersions(nodeId: string): Promise<NoteVersion[]> {
  if (supabase) {
    try {
      const userId = await getCurrentUserId();
      let query = supabase.from('note_versions').select('version').eq('node_id', nodeId);
      if (userId) query = query.eq('user_id', userId);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (!error && data) {
        return data.map((row) => row.version as NoteVersion);
      }
    } catch (error) {
      console.warn('note_versions unavailable, using local fallback:', error);
    }
  }
  return readLocal().filter((version) => version.nodeId === nodeId);
}

export async function revertToVersion(
  nodeId: string,
  version: NoteVersion,
  update: (patch: Partial<MindItem>) => Promise<void>,
): Promise<void> {
  await update({
    title: version.title,
    content: version.content,
    topic: version.topic,
    topicColor: version.topicColor,
    distilledNote: version.distilledNote,
    summary: version.summary,
    extractedText: version.extractedText,
    relatedIds: version.relatedIds,
    entryType: version.entryType,
    parentId: version.parentId,
  });
  void nodeId;
}