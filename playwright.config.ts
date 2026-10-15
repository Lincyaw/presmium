import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { SLIDES_PORT, WEB_PORT } from './e2e/urls.ts'

// `presmium build` writes each renderer's output to examples/demo/dist/<renderer id>.
// Build first (`pnpm demo:build`). A form whose output is missing is not served.
// Ports come from PRESMIUM_E2E_SLIDES_PORT / PRESMIUM_E2E_WEB_PORT so parallel
// checkouts do not collide; an occupied port is an error, never silently reused,
// so a run cannot test another checkout's build.
const servers = [
  { dir: 'examples/demo/dist/slides', port: SLIDES_PORT, single: true },
  { dir: 'examples/demo/dist/web', port: WEB_PORT, single: false },
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
    reuseExistingServer: false,
  })),
})
