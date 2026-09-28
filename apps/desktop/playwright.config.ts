import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Browser-only checks run through test:renderer and test:remote with their own configs.
  testIgnore: ['**/renderer/**', '**/remote/**'],
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
