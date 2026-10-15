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

// N-04: every spec runs in Chromium; the smoke test also runs in the other engines
// named by PRESMIUM_E2E_BROWSERS (default firefox; add webkit where the host has its
// system libraries, see `playwright install --with-deps`). Install them with
// `pnpm exec playwright install firefox webkit`. docs/browsers.md records the manual
// checks of Safari and Edge.
const OTHER_BROWSERS = { firefox: devices['Desktop Firefox'], webkit: devices['Desktop Safari'] }
const others = (process.env.PRESMIUM_E2E_BROWSERS ?? 'firefox').split(',').map(name => name.trim())
  .filter((name): name is keyof typeof OTHER_BROWSERS => Object.hasOwn(OTHER_BROWSERS, name))

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    ...others.map(name => ({ name, use: OTHER_BROWSERS[name], testMatch: 'smoke.spec.ts' })),
  ],
  webServer: servers.map(s => ({
    command: `pnpm exec sirv ${s.dir} ${s.single ? '--single ' : ''}--port ${s.port} --quiet`,
    port: s.port,
    reuseExistingServer: false,
  })),
})
