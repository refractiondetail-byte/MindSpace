import { handleAiRequest } from './server/aiCore';

interface Env {
  GEMINI_API_KEY?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/ai') {
      return handleAiRequest(request, env, {
        missingKeyHint:
          'Set it as a secret on the deployed Worker (`wrangler secret put GEMINI_API_KEY`) or in .dev.vars for local dev.',
      });
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
