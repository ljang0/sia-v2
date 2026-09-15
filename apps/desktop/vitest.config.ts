import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Keep local verification responsive alongside Sia and other Mac apps.
    maxWorkers: 1,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['src/renderer/index.tsx', 'src/preload/index.ts'],
    },
  },
});
