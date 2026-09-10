import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/remote',
  timeout: 20000,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['iPhone 13'],
    defaultBrowserType: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
  },
});
