import { defineConfig } from '@playwright/test'

// End-to-end tests: the real app, started against a throwaway Claude Code
// folder. OFICINA_E2E_EXE names the packaged .exe; without it, the app is
// run from this folder with Electron (build it first: npm run build).
export default defineConfig({
  testDir: 'test/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
})
