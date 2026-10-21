import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 1,
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm fixtures',
    url: 'http://localhost:5174/vanilla.html',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
