import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Keep local verification responsive alongside Sia and other Mac apps.
    maxWorkers: 1,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
