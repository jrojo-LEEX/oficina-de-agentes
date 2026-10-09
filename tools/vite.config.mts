import { defineConfig } from 'vite'

// Development tools that draw the real office: open /styleframes.html or
// /bench.html with `npx vite --config tools/vite.config.mts`. Never shipped.
export default defineConfig({
  root: 'tools',
  server: { fs: { allow: ['..'] } },
})
