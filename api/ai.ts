// NOTE: the `.js` extension is required, not cosmetic.
// `package.json` sets `"type": "module"`, so `@vercel/node` runs this file as
// native Node ESM and ships `api/` unbundled — Vite only bundles `src/`.
// Node's ESM loader resolves relative specifiers literally, so an extensionless
// `'../src/server/aiCore'` throws ERR_MODULE_NOT_FOUND at cold start, which
// Vercel reports as 500 FUNCTION_INVOCATION_FAILED. Writing the post-compile
// `.js` name is valid TypeScript (moduleResolution: bundler) and resolves to
// `src/server/aiCore.ts` for the Vite/Cloudflare build.
import { handleAiRequest, readEnv } from '../src/server/aiCore.js';

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
