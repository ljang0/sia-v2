import { defineConfig } from '@playwright/test';

// SIA_RENDERER_PORT lets parallel checkouts run this suite without reusing each other's server.
const port = Number(process.env.SIA_RENDERER_PORT) || 4178;
const baseURL = `http://127.0.0.1:${port}`;

// Real renderer, demo data, no Electron process or access to the user's apps/profile.
export default defineConfig({
  testDir: './tests/renderer',
  timeout: 30000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm exec vite src/renderer --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
