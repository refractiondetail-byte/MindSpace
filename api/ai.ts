import { handleAiRequest, readEnv } from '../src/server/aiCore';

/**
 * Vercel Function for `/api/ai` (Node.js runtime, fetch Web Standard export).
 * `api/ai.ts` maps to the `/api/ai` route automatically, so no rewrite is needed.
 */
export default {
  fetch(request: Request): Promise<Response> {
    return handleAiRequest(
      request,
      { GEMINI_API_KEY: readEnv('GEMINI_API_KEY') },
      {
        missingKeyHint:
          'Set GEMINI_API_KEY in Vercel → Project → Settings → Environment Variables ' +
          '(Production, Preview and Development), then redeploy.',
      },
    );
  },
};
