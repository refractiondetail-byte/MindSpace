import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

/**
 * On Vercel we need a plain SPA build (`dist/index.html` + `dist/assets`), while the
 * Cloudflare plugin emits `dist/client` + `dist/<worker>` and bundles the Worker.
 * Vercel sets `VERCEL=1`, so keep the plugin for local dev and `wrangler` deploys only.
 */
const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const isVercelBuild = Boolean(env.VERCEL ?? env.VERCEL_ENV);

export default defineConfig({
  plugins: [
    react(),
    ...(isVercelBuild ? [] : [cloudflare({ configPath: './wrangler.jsonc' })]),
  ],
  server: {
    port: 5173,
  },
});
