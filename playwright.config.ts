import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { defineConfig, devices, firefox, webkit } from '@playwright/test'
import { SLIDES_PORT, WEB_PORT } from './e2e/urls.ts'

const servers = [
  { form: 'e2e/fixtures/regression/dist/slides', port: SLIDES_PORT, single: 'slides/index.html' },
  { form: 'e2e/fixtures/regression/dist/web', port: WEB_PORT, single: '' },
].filter(s => existsSync(s.form))

const OTHER_BROWSERS = {
  firefox: { device: devices['Desktop Firefox'], engine: firefox },
  webkit: { device: devices['Desktop Safari'], engine: webkit },
}
type Browser = keyof typeof OTHER_BROWSERS

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
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'], testIgnore: 'perf.spec.ts' },
    { name: 'perf', use: devices['Desktop Chrome'], testMatch: 'perf.spec.ts', dependencies: ['chromium'] },
    ...others.map(name => ({ name, use: OTHER_BROWSERS[name].device, testMatch: 'smoke.spec.ts' })),
  ],
  webServer: servers.map(s => ({
    command: `node_modules/.bin/sirv e2e/fixtures/regression/dist ${s.single ? `--single ${s.single} ` : ''}--port ${s.port} --quiet`,
    port: s.port,
    reuseExistingServer: false,
  })),
})
