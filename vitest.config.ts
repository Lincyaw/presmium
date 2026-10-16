import vue from '@vitejs/plugin-vue'
import { configDefaults, defineConfig } from 'vitest/config'

/**
 * Tests that run `slidev export`: it serves the deck with Slidev's dev server and waits for
 * the browser to go idle, which a machine busy with the other tests' builds can make it miss
 * (an empty print page, a navigation that times out; presmium-export and presmium-diff then
 * fail, naming the slides the export lacks). They run once the others are done, as the timing
 * assertions of the end-to-end tests do.
 */
const EXPORTS = [
  'packages/addon-publish/test/export.test.ts',
  'packages/addon-publish/test/diff.test.ts',
  'packages/render-slides/test/slides.test.ts',
]

// Integration tests only (see docs/wbs.md): they run the real CLI, build output or servers.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    testTimeout: 30_000,
    projects: [
      { extends: true, test: { name: 'integration', include: ['packages/*/test/**/*.test.ts'], exclude: [...configDefaults.exclude, ...EXPORTS] } },
      { extends: true, test: { name: 'export', include: EXPORTS, sequence: { groupOrder: 1 } } },
    ],
  },
})
