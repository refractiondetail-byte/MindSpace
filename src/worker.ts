interface Env {
  GEMINI_API_KEY?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
}

interface OrganizeFile {
  name: string;
  mimeType: string;
  size?: number;
  text?: string;
  base64?: string;
}

interface TopicRef {
  id: string;
  name: string;
  color: string;
}

interface SearchItem {
  id: string;
  title: string;
  topic?: string;
  summary?: string;
  extractedText?: string;
}

const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];

class GeminiError extends Error {
  status: number;
  rawBody: string;
  constructor(status: number, rawBody: string) {
    super(`Gemini request failed (${status}): ${rawBody}`);
    this.name = 'GeminiError';
    this.status = status;
    this.rawBody = rawBody;
  }
}

async function callGemini(env: Env, model: string, body: Record<string, unknown>): Promise<string> {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const rawBody = await response.text();
    console.error(`Gemini ${model} non-200 (${response.status}):`, rawBody);
    throw new GeminiError(response.status, rawBody);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

async function generateWithFallback(
  env: Env,
  buildBody: (model: string) => Record<string, unknown>,
): Promise<string> {
  let lastError: unknown;
  for (const model of GEMINI_MODELS) {
    try {
      return await callGemini(env, model, buildBody(model));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gemini request failed');
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleOrganize(env: Env, payload: Record<string, unknown>): Promise<Response> {
  const text = typeof payload.text === 'string' ? payload.text : '';
  const files = Array.isArray(payload.files) ? (payload.files as OrganizeFile[]) : [];
  const topics = Array.isArray(payload.topics) ? (payload.topics as TopicRef[]) : [];

  const parts: Array<Record<string, unknown>> = [];
  parts.push({
    text: `You are MindSpace's AI organizer. Analyze the imported content and return strict JSON.

Existing topics:
${topics.map((topic) => `- ${topic.id}: ${topic.name} (${topic.color})`).join('\n') || '(none)'}

Rules:
- Choose the best matching existing topic by semantic similarity. If none match, suggest a concise new topic name and a hex color.
- Generate a clean title, a crisp 1-2 sentence distilled_note takeaway/gist (the distilled Brain layer), a 2-3 sentence searchable summary (the Record layer context), and extracted key terms/text (especially OCR/concepts from images or PDFs).
- Preserve the raw uploaded file/text as the record; distilled_note is only the concise takeaway.
- Automatically match topic & topic_color to an existing Topic/Hub or assign a concise new Topic name + hex color; never ask the user.
- related_ids must contain IDs from the existing topics list that are related (Threads & Bridges).
- Return only JSON with keys: topic, topic_color, title, summary, distilled_note, extracted_text, related_ids.`,
  });

  if (text.trim()) {
    parts.push({ text: `Text content:\n${text}` });
  }

  for (const file of files) {
    if (file.text && file.mimeType.startsWith('text/')) {
      parts.push({ text: `File ${file.name}:\n${file.text}` });
    } else if (file.base64) {
      parts.push({
        inlineData: {
          mimeType: file.mimeType || 'application/octet-stream',
          data: file.base64,
        },
      });
      parts.push({ text: `Above file is ${file.name}. Extract its useful text, concepts, and key terms.` });
    }
  }

  const raw = await generateWithFallback(env, () => ({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: 'MEDIUM' },
      responseSchema: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING' },
          topic_color: { type: 'STRING' },
          title: { type: 'STRING' },
          summary: { type: 'STRING' },
          distilled_note: { type: 'STRING' },
          extracted_text: { type: 'STRING' },
          related_ids: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['topic', 'topic_color', 'title', 'summary', 'distilled_note', 'extracted_text', 'related_ids'],
      },
    },
  }));

  try {
    return jsonResponse(JSON.parse(raw));
  } catch {
    return jsonResponse({ error: 'Invalid AI response', status: 502, raw, rawBody: raw }, 502);
  }
}

async function handleSearch(env: Env, payload: Record<string, unknown>): Promise<Response> {
  const query = typeof payload.query === 'string' ? payload.query : '';
  const items = Array.isArray(payload.items) ? (payload.items as SearchItem[]) : [];

  const raw = await generateWithFallback(env, () => ({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `You are MindSpace's semantic search. Given a user query and an item index, return ranked matching item IDs, a concise 1-2 sentence answer grounded in the matching items, and a short reason for each match.

The query may be misspelled or natural language. Match by meaning, topic, summary, and extracted text. Tolerate typos.

Query: ${query}

Items:
${items
  .map(
    (item) =>
      `- ${item.id}: ${item.title} | topic: ${item.topic ?? ''} | summary: ${item.summary ?? ''} | text: ${item.extractedText ?? ''}`,
  )
  .join('\n')}

Return strict JSON with keys:
- ranked_ids: array of matching item id strings, best first.
- answer: string, 1-2 sentences summarizing the best matches.
- reasons: array of objects { id: string, why: string } where why states why that item matched (e.g. matched topic, summary, or extracted file text).`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          ranked_ids: { type: 'ARRAY', items: { type: 'STRING' } },
          answer: { type: 'STRING' },
          reasons: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                id: { type: 'STRING' },
                why: { type: 'STRING' },
              },
              required: ['id', 'why'],
            },
          },
        },
        required: ['ranked_ids', 'answer'],
      },
    },
  }));

  try {
    return jsonResponse(JSON.parse(raw));
  } catch {
    return jsonResponse({ error: 'Invalid AI response', status: 502, raw, rawBody: raw }, 502);
  }
}

async function handleAnalyzeGaps(env: Env, payload: Record<string, unknown>): Promise<Response> {
  const topic = typeof payload.topic === 'string' ? payload.topic : 'Topic';
  const items = Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : [];

  const notes = items
    .map((item, index) => {
      const title = typeof item.title === 'string' ? item.title : `Note ${index + 1}`;
      const distilled = typeof item.distilledNote === 'string' ? item.distilledNote : '';
      const summary = typeof item.summary === 'string' ? item.summary : '';
      const extracted = typeof item.extractedText === 'string' ? item.extractedText : '';
      return `- ${title}\n  distilled: ${distilled}\n  summary: ${summary}\n  extracted: ${extracted}`;
    })
    .join('\n');

  const raw = await generateWithFallback(env, () => ({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `You are MindSpace's gap detector. Given a topic and its distilled notes/extracted summaries, identify missing concepts or thin areas and suggest follow-up questions. Return strict JSON.

Topic: ${topic}

Notes:
${notes || '(none)'}

Return JSON with keys:
- missing_concepts: array of short strings naming key subtopics or details missing.
- follow_up_questions: array of concise study/capture questions.`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          missing_concepts: { type: 'ARRAY', items: { type: 'STRING' } },
          follow_up_questions: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['missing_concepts', 'follow_up_questions'],
      },
    },
  }));

  try {
    return jsonResponse(JSON.parse(raw));
  } catch {
    return jsonResponse({ error: 'Invalid AI response', status: 502, raw, rawBody: raw }, 502);
  }
}

async function handleSynthesizeTopic(env: Env, payload: Record<string, unknown>): Promise<Response> {
  const topic = typeof payload.topic === 'string' ? payload.topic : 'Topic';
  const items = Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : [];

  const notes = items
    .map((item, index) => {
      const title = typeof item.title === 'string' ? item.title : `Note ${index + 1}`;
      const distilled = typeof item.distilledNote === 'string' ? item.distilledNote : '';
      const summary = typeof item.summary === 'string' ? item.summary : '';
      const extracted = typeof item.extractedText === 'string' ? item.extractedText : '';
      return `- ${title}\n  distilled: ${distilled}\n  summary: ${summary}\n  extracted: ${extracted}`;
    })
    .join('\n');

  const raw = await generateWithFallback(env, () => ({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `You are MindSpace's topic synthesizer. Given a topic and its distilled notes/summaries/extracted text, create a concise master synthesis. Return strict JSON.

Topic: ${topic}

Notes:
${notes || '(none)'}

Return JSON with keys:
- master_overview: string, 2-4 sentences synthesizing the topic.
- key_takeaways: array of short strings (formulas, concepts, facts).
- open_questions: array of concise unanswered questions.`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          master_overview: { type: 'STRING' },
          key_takeaways: { type: 'ARRAY', items: { type: 'STRING' } },
          open_questions: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['master_overview', 'key_takeaways', 'open_questions'],
      },
    },
  }));

  try {
    return jsonResponse(JSON.parse(raw));
  } catch {
    return jsonResponse({ error: 'Invalid AI response', status: 502, raw, rawBody: raw }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/ai' && request.method === 'POST') {
      try {
        const payload = (await request.json()) as Record<string, unknown>;
        if (payload.action === 'organize') return await handleOrganize(env, payload);
        if (payload.action === 'search') return await handleSearch(env, payload);
        if (payload.action === 'analyze_gaps') return await handleAnalyzeGaps(env, payload);
        if (payload.action === 'synthesize_topic') return await handleSynthesizeTopic(env, payload);
        return jsonResponse({ error: 'Unknown action' }, 400);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Request failed';
        const status =
          error instanceof GeminiError
            ? error.status
            : typeof (error as { status?: unknown })?.status === 'number'
              ? ((error as { status: number }).status)
              : 500;
        const rawBody =
          error instanceof GeminiError
            ? error.rawBody
            : typeof (error as { rawBody?: unknown })?.rawBody === 'string'
              ? (error as { rawBody: string }).rawBody
              : error instanceof Error
                ? error.stack ?? error.message
                : String(error);
        console.error('AI handler failed:', { message, status, rawBody, error });
        return jsonResponse({ error: message, status, rawBody }, status);
      }
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};