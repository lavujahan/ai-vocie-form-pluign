import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Fixture pages for manual testing and Playwright: `pnpm fixtures` → http://localhost:5174
export default defineConfig({
  root: __dirname,
  plugins: [react(), vue()],
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  server: { port: 5174, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        vanilla: resolve(__dirname, 'vanilla.html'),
        react: resolve(__dirname, 'react.html'),
        vue: resolve(__dirname, 'vue.html'),
        cascade: resolve(__dirname, 'cascade.html'),
      },
    },
  },
});
