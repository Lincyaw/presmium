import { defineConfig } from 'vitest/config'

// The tests run the real presmium CLI: a build or a server's start takes seconds.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 180_000,
  },
})
