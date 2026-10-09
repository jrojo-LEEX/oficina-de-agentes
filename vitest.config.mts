import { defineConfig } from 'vitest/config'

// Unit tests of the newer modules (paths, config, schemas, languages). The
// older suites in test/*.test.ts run on node:test (npm run test:legacy).
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
  },
})
