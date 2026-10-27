import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { crx, defineManifest } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBase = (env.VITE_API_BASE || 'http://localhost:3000').replace(/\/$/, '');
  const supabase = env.VITE_SUPABASE_URL ? `${new URL(env.VITE_SUPABASE_URL).origin}/*` : 'https://*.supabase.co/*';

  // Toolbar and store icons: public/icons/icon-16.png, -32, -48 and -128 (used once all four exist).
  const icons = Object.fromEntries([16, 32, 48, 128].map((s) => [String(s), `icons/icon-${s}.png`]));
  const haveIcons = Object.values(icons).every((f) => existsSync(resolve(__dirname, 'public', f)));

  const manifest = defineManifest({
    manifest_version: 3,
    name: 'Voice2Fill: Speak Tamil or English to fill web forms',
    short_name: 'Voice2Fill',
    version: '1.0.0',
    description: 'Fill the form on this page by speaking on your phone in Tamil, English or Tanglish.',
    ...(haveIcons ? { icons } : {}),
    action: { default_popup: 'src/popup/index.html', default_title: 'Voice2Fill', ...(haveIcons ? { default_icon: icons } : {}) },
    background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
    permissions: ['storage', 'activeTab', 'scripting'],
    // The service worker calls the API and Supabase Realtime directly (no CORS from the worker).
    host_permissions: [`${new URL(apiBase).origin}/*`, supabase],
    // Nothing runs on websites by default. When the user taps "Scan form", the popup asks Chrome for that
    // one site, and the worker registers the form detector for it (later pages of the form load it too).
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    // The e2e build drives the detector on the local test pages directly (no permission prompt in tests).
    ...(mode === 'e2e'
      ? { content_scripts: [{ matches: ['http://localhost/*', 'http://127.0.0.1/*'], js: ['src/content/index.ts'], run_at: 'document_idle' as const }] }
      : {}),
  });

  return {
    plugins: [react(), tailwindcss(), crx({ manifest })],
    build: { outDir: 'dist', emptyOutDir: true },
    server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
  };
});
