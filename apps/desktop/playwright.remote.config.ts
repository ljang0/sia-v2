import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/remote',
  timeout: 20000,
  workers: 1,
  reporter: 'list',
  projects: [
    { name: 'phone-chromium', use: { browserName: 'chromium' } },
    { name: 'phone-webkit', use: { browserName: 'webkit' } },
  ],
  use: {
    ...devices['iPhone 13'],
    headless: true,
    screenshot: 'only-on-failure',
  },
});
