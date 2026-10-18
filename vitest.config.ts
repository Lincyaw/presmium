import vue from '@vitejs/plugin-vue'
import { configDefaults, defineConfig } from 'vitest/config'

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
    projects: [
      { extends: true, test: { name: 'integration', include: ['packages/*/test/**/*.test.ts'], exclude: [...configDefaults.exclude, ...EXPORTS] } },
      { extends: true, test: { name: 'export', include: EXPORTS, sequence: { groupOrder: 1 } } },
    ],
  },
})
