import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Integration tests only (see docs/wbs.md): they run the real CLI, build output or servers.
export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
})
