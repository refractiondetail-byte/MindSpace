export interface OrganizeResult {
  topic: string;
  topic_color: string;
  title: string;
  summary: string;
  distilled_note: string;
  extracted_text: string;
  related_ids: string[];
}

export interface GapAnalysisResult {
  missing_concepts: string[];
  follow_up_questions: string[];
}

export interface SynthesisResult {
  master_overview: string;
  key_takeaways: string[];
  open_questions: string[];
}

export async function synthesizeTopicWithAI(payload: {
  topic: string;
  items: Array<{ title: string; distilledNote?: string; summary?: string; extractedText?: string }>;
}): Promise<SynthesisResult> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'synthesize_topic', ...payload }),
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
    const message = [`Topic synthesis failed: ${response.status}`, errorText, rawBody]
      .filter(Boolean)
      .join(' - ');
    console.error(message, { status: response.status, error: errorText, rawBody });
    throw new Error(message);
  }
  return (await response.json()) as SynthesisResult;
}

export async function analyzeGapsWithAI(payload: {
  topic: string;
  items: Array<{ title: string; distilledNote?: string; summary?: string; extractedText?: string }>;
}): Promise<GapAnalysisResult> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'analyze_gaps', ...payload }),
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
    const message = [`Gap analysis failed: ${response.status}`, errorText, rawBody]
      .filter(Boolean)
      .join(' - ');
    console.error(message, { status: response.status, error: errorText, rawBody });
    throw new Error(message);
  }
  return (await response.json()) as GapAnalysisResult;
}

export interface SearchReason {
  id: string;
  why: string;
}

export interface SearchResult {
  ranked_ids: string[];
  answer: string;
  reasons?: SearchReason[];
}

export async function organizeWithAI(payload: {
  text?: string;
  files?: Array<{ name: string; mimeType: string; size?: number; text?: string; base64?: string }>;
  topics?: Array<{ id: string; name: string; color: string }>;
}): Promise<OrganizeResult> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'organize', ...payload }),
  });
  if (!response.ok) {
    const rawText = await response.text().catch(() => '');
    let data: { error?: string; status?: number; rawBody?: string } | null = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }
    const errorText = data?.error ?? '';
    const rawBody = data?.rawBody ?? rawText;
    const message = [`Organize failed: ${response.status}`, errorText, rawBody]
      .filter(Boolean)
      .join(' - ');
    console.error(`Organize failed: ${response.status} - error: ${errorText} - rawBody: ${rawBody}`, { status: response.status, error: errorText, rawBody, rawText });
    throw new Error(message);
  }
  return (await response.json()) as OrganizeResult;
}

export async function searchWithAI(payload: {
  query: string;
  items: Array<{ id: string; title: string; topic?: string; summary?: string; extractedText?: string }>;
}): Promise<SearchResult> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'search', ...payload }),
  });
  if (!response.ok) {
    const rawText = await response.text().catch(() => '');
    let data: { error?: string; status?: number; rawBody?: string } | null = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }
    const errorText = data?.error ?? '';
    const rawBody = data?.rawBody ?? rawText;
    const message = [`Search failed: ${response.status}`, errorText, rawBody]
      .filter(Boolean)
      .join(' - ');
    console.error(`Search failed: ${response.status} - error: ${errorText} - rawBody: ${rawBody}`, { status: response.status, error: errorText, rawBody, rawText });
    throw new Error(message);
  }
  return (await response.json()) as SearchResult;
}