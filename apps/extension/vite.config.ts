import { crx, defineManifest } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBase = (env.VITE_API_BASE || 'http://localhost:3000').replace(/\/$/, '');
  const supabase = env.VITE_SUPABASE_URL ? `${new URL(env.VITE_SUPABASE_URL).origin}/*` : 'https://*.supabase.co/*';

  const manifest = defineManifest({
    manifest_version: 3,
    name: 'Voice form filler',
    version: '0.1.0',
    description: 'Fill the form on this page by speaking on your phone.',
    action: { default_popup: 'src/popup/index.html', default_title: 'Voice form filler' },
    background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
    permissions: ['storage', 'activeTab', 'scripting'],
    // The service worker calls the API and Supabase Realtime directly (no CORS from the worker).
    host_permissions: [`${new URL(apiBase).origin}/*`, supabase],
    content_scripts: [
      {
        matches: ['http://*/*', 'https://*/*', 'file:///*'],
        js: ['src/content/index.ts'],
        run_at: 'document_idle',
      },
    ],
  });

  return {
    plugins: [react(), tailwindcss(), crx({ manifest })],
    build: { outDir: 'dist', emptyOutDir: true },
    server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
  };
});
