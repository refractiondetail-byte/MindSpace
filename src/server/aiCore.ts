/**
 * Shared Gemini logic behind `/api/ai`, used by both hosts:
 * - Cloudflare Worker: `src/worker.ts`
 * - Vercel Function:   `api/ai.ts`
 *
 * Web-standard only (fetch / Request / Response), so neither runtime needs
 * host-specific imports. The API key is never logged or returned to the client.
 */

export interface AiEnv {
  GEMINI_API_KEY?: string;
}

export interface AiHandlerOptions {
  /** Host-specific instruction appended to the missing-key error. */
  missingKeyHint?: string;
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

const GEMINI_KEY_NAME = 'GEMINI_API_KEY';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const DEFAULT_KEY_HINT =
  'Set it as a secret for the deployed host (Cloudflare: `wrangler secret put GEMINI_API_KEY`; ' +
  'Vercel: Project Settings → Environment Variables) or in .dev.vars for local dev.';

/** Strip whitespace/quotes/`Bearer ` wrappers that sneak in when a key is pasted into a dashboard. */
export function normalizeSecret(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let key = value.trim();
  if (!key) return undefined;
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/^bearer\s+/i, '').trim();
  return key || undefined;
}

/**
 * `process` only exists when the `nodejs_compat` flag is on in the Workers runtime,
 * so reach it through globalThis instead of a bare reference that would throw there.
 */
export function readEnv(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

/**
 * Resolve the Gemini key from the host `env` binding (a Worker secret, `.dev.vars`,
 * or a Vercel env var passed in), falling back to `process.env` on Node hosts.
 */
function resolveGeminiKey(env: AiEnv | undefined): string | undefined {
  return normalizeSecret(env?.[GEMINI_KEY_NAME]) ?? normalizeSecret(readEnv(GEMINI_KEY_NAME));
}

/** Remove the API key (raw or URL-encoded) from anything headed for logs or a response. */
function redactSecret(text: string, key: string | undefined): string {
  if (!key) return text;
  let safe = text.split(key).join('[redacted]');
  const encoded = encodeURIComponent(key);
  if (encoded !== key) safe = safe.split(encoded).join('[redacted]');
  return safe;
}

function missingKeyError(env: AiEnv | undefined, options: AiHandlerOptions): Error {
  const bindingNames = Object.keys((env ?? {}) as Record<string, unknown>).sort();
  const visible = bindingNames.length ? bindingNames.join(', ') : '(none)';
  return new Error(
    `GEMINI_API_KEY is not configured for this request. ${options.missingKeyHint ?? DEFAULT_KEY_HINT} ` +
      `Bindings visible to this request: ${visible}.`,
  );
}

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

async function callGemini(
  env: AiEnv | undefined,
  model: string,
  body: Record<string, unknown>,
  options: AiHandlerOptions,
): Promise<string> {
  const key = resolveGeminiKey(env);
  if (!key) throw missingKeyError(env, options);

  const response = await fetch(
    `${GEMINI_ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const rawBody = redactSecret(await response.text(), key);
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
  env: AiEnv | undefined,
  buildBody: (model: string) => Record<string, unknown>,
  options: AiHandlerOptions,
): Promise<string> {
  // Fail fast when the key is missing: retrying every model with the same absent
  // binding only buries the real cause under the last model's error.
  if (!resolveGeminiKey(env)) throw missingKeyError(env, options);

  let lastError: unknown;
  for (const model of GEMINI_MODELS) {
    try {
      return await callGemini(env, model, buildBody(model), options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gemini request failed');
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function handleOrganize(
  env: AiEnv | undefined,
  payload: Record<string, unknown>,
  options: AiHandlerOptions,
): Promise<Response> {
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

  const raw = await generateWithFallback(
    env,
    () => ({
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
    }),
    options,
  );

  try {
    return jsonResponse(JSON.parse(raw));
  } catch {
    return jsonResponse({ error: 'Invalid AI response', status: 502, raw, rawBody: raw }, 502);
  }
}

async function handleSearch(
  env: AiEnv | undefined,
  payload: Record<string, unknown>,
  options: AiHandlerOptions,
): Promise<Response> {
  const query = typeof payload.query === 'string' ? payload.query : '';
  const items = Array.isArray(payload.items) ? (payload.items as SearchItem[]) : [];

  const raw = await generateWithFallback(
    env,
    () => ({
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
    }),
    options,
  );

  try {
    return jsonResponse(JSON.parse(raw));
  } catch {
    return jsonResponse({ error: 'Invalid AI response', status: 502, raw, rawBody: raw }, 502);
  }
}

async function handleAnalyzeGaps(
  env: AiEnv | undefined,
  payload: Record<string, unknown>,
  options: AiHandlerOptions,
): Promise<Response> {
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

  const raw = await generateWithFallback(
    env,
    () => ({
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
    }),
    options,
  );

  try {
    return jsonResponse(JSON.parse(raw));
  } catch {
    return jsonResponse({ error: 'Invalid AI response', status: 502, raw, rawBody: raw }, 502);
  }
}

async function handleSynthesizeTopic(
  env: AiEnv | undefined,
  payload: Record<string, unknown>,
  options: AiHandlerOptions,
): Promise<Response> {
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

  const raw = await generateWithFallback(
    env,
    () => ({
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
    }),
    options,
  );

  try {
    return jsonResponse(JSON.parse(raw));
  } catch {
    return jsonResponse({ error: 'Invalid AI response', status: 502, raw, rawBody: raw }, 502);
  }
}

/**
 * Handle a `/api/ai` request. Shared by the Cloudflare Worker and the Vercel
 * Function so both hosts get identical actions, prompts and error shapes.
 */
export async function handleAiRequest(
  request: Request,
  env: AiEnv | undefined,
  options: AiHandlerOptions = {},
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405, { Allow: 'POST' });
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (payload.action === 'organize') return await handleOrganize(env, payload, options);
    if (payload.action === 'search') return await handleSearch(env, payload, options);
    if (payload.action === 'analyze_gaps') return await handleAnalyzeGaps(env, payload, options);
    if (payload.action === 'synthesize_topic') return await handleSynthesizeTopic(env, payload, options);
    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (error) {
    const key = resolveGeminiKey(env);
    const message = redactSecret(error instanceof Error ? error.message : 'Request failed', key);
    const status =
      error instanceof GeminiError
        ? error.status
        : typeof (error as { status?: unknown })?.status === 'number'
          ? (error as { status: number }).status
          : 500;
    const rawBody = redactSecret(
      error instanceof GeminiError
        ? error.rawBody
        : error instanceof Error
          ? error.message
          : String(error),
      key,
    );
    console.error('AI handler failed:', { message, status, rawBody });
    return jsonResponse({ error: message, status, rawBody }, status);
  }
}
