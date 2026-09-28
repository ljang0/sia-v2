import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/mobile'),
  base: './',
  plugins: [react()],
  esbuild: { legalComments: 'inline' },
  build: {
    outDir: resolve(import.meta.dirname, 'out/remote'),
    emptyOutDir: true,
    // iOS Home Screen icons need a fetchable file, even when the artwork is tiny.
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // The phone receives this bundle independently of the packaged Mac app.
        banner: `/*!\n${readFileSync(resolve(import.meta.dirname, '../../THIRD_PARTY_NOTICES.md'), 'utf8')}\n*/`,
      },
    },
  },
});
