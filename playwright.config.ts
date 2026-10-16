import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { defineConfig, devices, firefox, webkit } from '@playwright/test'
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

// N-04: every spec runs in Chromium; the smoke test also runs in the other engines named by
// PRESMIUM_E2E_BROWSERS (default firefox and webkit, the engine of Safari; Edge is Chromium).
// An engine that is not installed, or cannot start on this host (WebKit needs system libraries
// many Linux hosts lack), is left out with a note; docs/browsers.md says how to run it in
// Playwright's Docker image and which checks of the real browsers stay manual.
const OTHER_BROWSERS = {
  firefox: { device: devices['Desktop Firefox'], engine: firefox },
  webkit: { device: devices['Desktop Safari'], engine: webkit },
}
type Browser = keyof typeof OTHER_BROWSERS

/**
 * Whether an engine starts here. Asked once, by the main process: its answer is passed to the
 * workers, which load this file again, in the environment.
 */
function runnable(name: Browser): boolean {
  const known = process.env[`PRESMIUM_E2E_RUNS_${name.toUpperCase()}`]
  if (known !== undefined) return known === '1'
  let runs = existsSync(OTHER_BROWSERS[name].engine.executablePath())
  if (!runs) {
    console.warn(`[presmium] ${name} is not installed; its smoke tests are skipped. Install it with: pnpm exec playwright install ${name}`)
  } else {
    const probe = `require('@playwright/test').${name}.launch().then(browser => browser.close(), () => process.exit(1))`
    runs = spawnSync(process.execPath, ['-e', probe], { stdio: 'ignore', timeout: 60_000 }).status === 0
    if (!runs) console.warn(`[presmium] ${name} cannot start on this host (missing system libraries?); its smoke tests are skipped. Install them with: pnpm exec playwright install-deps ${name}, or run it in Playwright's Docker image (docs/browsers.md)`)
  }
  process.env[`PRESMIUM_E2E_RUNS_${name.toUpperCase()}`] = runs ? '1' : '0'
  return runs
}

const others = (process.env.PRESMIUM_E2E_BROWSERS ?? 'firefox,webkit').split(',').map(name => name.trim())
  .filter((name): name is Browser => Object.hasOwn(OTHER_BROWSERS, name))
  .filter(runnable)

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
    ...others.map(name => ({ name, use: OTHER_BROWSERS[name].device, testMatch: 'smoke.spec.ts' })),
  ],
  webServer: servers.map(s => ({
    // The binary itself rather than `pnpm exec`, so the config also runs where pnpm is not
    // installed, e.g. in the Playwright Docker image (docs/browsers.md).
    command: `node_modules/.bin/sirv ${s.dir} ${s.single ? '--single ' : ''}--port ${s.port} --quiet`,
    port: s.port,
    reuseExistingServer: false,
  })),
})
