import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { SLIDES_PORT, WEB_PORT } from './e2e/urls.ts'

// `presmium build` writes each renderer's output to examples/demo/dist/<renderer id>, and the
// forms built together are one site: the web form under /web/, the slides under /slides/ (see
// e2e/urls.ts). Build first (`pnpm demo:build`). A form whose output is missing is not served.
// Ports come from PRESMIUM_E2E_SLIDES_PORT / PRESMIUM_E2E_WEB_PORT so parallel
// checkouts do not collide; an occupied port is an error, never silently reused,
// so a run cannot test another checkout's build.
const servers = [
  { form: 'examples/demo/dist/slides', port: SLIDES_PORT, single: 'slides/index.html' },
  { form: 'examples/demo/dist/web', port: WEB_PORT, single: '' },
].filter(s => existsSync(s.form))

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
    { name: 'chromium', use: devices['Desktop Chrome'], testIgnore: 'perf.spec.ts' },
    // The timing assertions of N-01 and N-02 run once the other specs are done, so neither
    // their measurements nor the timing assertions of other specs share the machine. A run of
    // perf.spec.ts alone needs `--no-deps` (`pnpm exec playwright test e2e/perf.spec.ts --no-deps`);
    // without it, Playwright runs every Chromium spec first.
    { name: 'perf', use: devices['Desktop Chrome'], testMatch: 'perf.spec.ts', dependencies: ['chromium'] },
    ...others.map(name => ({ name, use: OTHER_BROWSERS[name], testMatch: 'smoke.spec.ts' })),
  ],
  webServer: servers.map(s => ({
    // The binary itself rather than `pnpm exec`, so the config also runs where pnpm is not
    // installed, e.g. in the Playwright Docker image (docs/browsers.md).
    command: `node_modules/.bin/sirv examples/demo/dist ${s.single ? `--single ${s.single} ` : ''}--port ${s.port} --quiet`,
    port: s.port,
    reuseExistingServer: false,
  })),
})
