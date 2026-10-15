import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Unit tests run in Node by default. Tests that need a DOM start with
// `// @vitest-environment happy-dom`.
export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
})
