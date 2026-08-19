import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const workspacePackages = [
  '@sia/protocol',
  '@sia/runtime',
  '@sia/action-gateway',
  '@sia/tool-bridge',
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, 'src/main/index.ts'),
          'tool-bridge': resolve(import.meta.dirname, 'src/main/tool-bridge-entry.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@sia/protocol'] })],
    build: {
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/preload/index.ts'),
        output: { format: 'cjs', entryFileNames: 'index.js' },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/renderer/index.html'),
      },
    },
  },
});
