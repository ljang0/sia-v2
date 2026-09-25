import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // These browser-only checks start their own demo server via test:renderer.
  testIgnore: '**/renderer/**',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
});
