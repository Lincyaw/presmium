import vue from '@vitejs/plugin-vue'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { configDefaults, defineConfig } from 'vitest/config'

// Fixtures and child processes must refer to temporary files by the same real path.
process.env.TMPDIR = realpathSync(tmpdir())

const EXPORTS = [
  'packages/addon-publish/test/export.test.ts',
  'packages/addon-publish/test/diff.test.ts',
  'packages/render-slides/test/slides.test.ts',
]

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    testTimeout: 30_000,
    // Each file launches real framework builds, services or browsers.
    maxWorkers: 1,
    projects: [
      { extends: true, test: { name: 'integration', include: ['packages/*/test/**/*.test.ts'], exclude: [...configDefaults.exclude, ...EXPORTS] } },
      { extends: true, test: { name: 'export', include: EXPORTS, sequence: { groupOrder: 1 } } },
    ],
  },
})
