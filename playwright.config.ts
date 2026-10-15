import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// Slides form is served on 4173 (examples/demo/dist), web form on 4174 (examples/demo/dist-web).
// Build first: `pnpm demo:build && pnpm demo:web`. A form whose build output is missing is not served.
const servers = [
  { dir: 'examples/demo/dist', port: 4173, single: true },
  { dir: 'examples/demo/dist-web', port: 4174, single: false },
].filter(s => existsSync(s.dir))

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  webServer: servers.map(s => ({
    command: `pnpm exec sirv ${s.dir} ${s.single ? '--single ' : ''}--port ${s.port} --quiet`,
    port: s.port,
    reuseExistingServer: true,
  })),
})
