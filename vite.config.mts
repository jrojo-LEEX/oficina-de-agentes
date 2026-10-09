import { resolve } from 'node:path'

import { defineConfig } from 'vite'

// The pages are loaded from disk by Electron, so asset paths stay relative.
export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'chrome130',
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'src/index.html'),
        setup: resolve(import.meta.dirname, 'src/setup.html'),
      },
    },
  },
})
