import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { defineConfig } from 'vitest/config'

// Fixtures and child processes must refer to temporary files by the same real path.
process.env.TMPDIR = realpathSync(tmpdir())

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    // Each file launches real framework builds, services or browsers.
    maxWorkers: 1,
    projects: [
      { extends: true, test: { name: 'integration', include: ['packages/*/test/**/*.test.ts'] } },
    ],
  },
})
