import type { DocumentExtractionStatus } from '../core/types';

/** Shared POST helper so every action gets the same error surface. */
async function postAi<T>(
  action: string,
  payload: Record<string, unknown>,
  label: string,
): Promise<T> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!response.ok) {
    const rawText = await response.text().catch(() => '');
    let data: { error?: string; rawBody?: string } | null = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }
    const errorText = data?.error ?? '';
    const rawBody = data?.rawBody ?? rawText;
    const message = [`${label} failed: ${response.status}`, errorText, rawBody]
      .filter(Boolean)
      .join(' - ');
    console.error(message, { status: response.status, error: errorText, rawBody });
    throw new Error(message);
  }
  return (await response.json()) as T;
}

/* ------------------------------------------------------------- organize */

export interface OrganizeResult {
  topic: string;
  topic_color: string;
  title: string;
  summary: string;
  distilled_note: string;
  extracted_text: string;
  related_ids: string[];
}

export async function organizeWithAI(payload: {
  text?: string;
  files?: Array<{ name: string; mimeType: string; size?: number; text?: string; base64?: string }>;
  topics?: Array<{ id: string; name: string; color: string }>;
}): Promise<OrganizeResult> {
  return postAi<OrganizeResult>('organize', payload, 'Organize');
}

/** One batched import: all files at once, so the AI can build the hierarchy. */
export interface BatchOrganizeFile {
  index: number;
  name: string;
  mimeType: string;
  size?: number;
  kind: string;
  status: DocumentExtractionStatus;
  note?: string;
  truncated?: boolean;
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface BatchOrganizeResult {
  star: { name: string; color: string };
  planets: Array<{ name: string; summary: string; moon_indices: number[] }>;
  moons: Array<{
    index: number;
    title: string;
    summary: string;
    distilled_note: string;
    extracted_text: string;
    planet: string;
  }>;
  related_ids?: string[];
}

export async function organizeBatchWithAI(payload: {
  files: BatchOrganizeFile[];
  stars?: Array<{ id: string; name: string; color: string }>;
  units?: Array<{ star: string; name: string }>;
}): Promise<BatchOrganizeResult> {
  return postAi<BatchOrganizeResult>('organize_batch', payload, 'Import');
}

/* --------------------------------------------------------------- search */

export interface SearchReason {
  id: string;
  why: string;
}

export interface SearchResult {
  ranked_ids: string[];
  answer: string;
  reasons?: SearchReason[];
}

export async function searchWithAI(payload: {
  query: string;
  items: Array<{ id: string; title: string; topic?: string; summary?: string; extractedText?: string }>;
}): Promise<SearchResult> {
  return postAi<SearchResult>('search', payload, 'Search');
}

/* ----------------------------------------------------------------- chat */

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatMoonContext {
  title: string;
  text?: string;
  status?: DocumentExtractionStatus;
  note?: string;
}

export interface ChatIndexEntry {
  id: string;
  title: string;
  star?: string;
  planet?: string;
  status?: DocumentExtractionStatus;
}

export interface ChatResult {
  reply: string;
  focus_ids?: string[];
  star_name?: string;
  star_color?: string;
  planets?: Array<{ name: string; item_ids: string[] }>;
}

export async function chatWithAI(payload: {
  message: string;
  history: ChatTurn[];
  moon?: ChatMoonContext | null;
  index?: ChatIndexEntry[];
}): Promise<ChatResult> {
  return postAi<ChatResult>('chat', payload, 'Assistant');
}
