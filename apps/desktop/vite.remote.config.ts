import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/mobile'),
  base: './',
  plugins: [react()],
  build: { outDir: resolve(import.meta.dirname, 'out/remote'), emptyOutDir: true },
});
