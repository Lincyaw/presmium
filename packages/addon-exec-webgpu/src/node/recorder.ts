/**
 * Compile-time runs of WGSL shaders (P-104): in Playwright's Chromium, with
 * the GPU through Vulkan where Chromium finds one, else with SwiftShader (the
 * CPU emulation every Chromium has), as the environment's `adapter` option
 * says. The page is served by Playwright's routing from an `https:` origin
 * (WebGPU needs a secure context) and runs the compute core the browser's
 * worker runs (../gpu.mjs), so the recording is what a learner's run shows.
 * The browser gets `RunContext.env` as its environment and nothing else of
 * this process's (docs/architecture.md 4.6, 10.6), and is closed after each
 * run: the compiler has no hook to close it later.
 *
 * The environment fingerprint names the browser and the adapter, `fallback`
 * for SwiftShader. Where Chromium is not installed the executor runs nothing
 * (recordings stand in); where it has no adapter, or the adapter cannot run
 * a shader (a missing feature or limit, a lost device), the run fails without
 * a result, so no failure is recorded in place of a later success.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { failedRun } from '@presmium/kernel'
import type { Executor, RunContext, RunResult } from '@presmium/kernel'
import type { Browser, BrowserType, Page } from 'playwright-chromium'
import { adapterName, computeRequest, DEFAULT_TIMEOUT_MS, failure, fingerprint, isWgsl, MESSAGES, programError, runResult, unavailable } from '../domain/index.ts'
import type { AdapterChoice, AdapterDescription, ComputeOutcome, ComputeRequest } from '../domain/index.ts'

/** Chromium's flags for WebGPU on the GPU, through Vulkan, and on SwiftShader (docs/architecture.md section 7). */
export const CHROMIUM_ARGS: Record<Exclude<AdapterChoice, 'auto'>, string[]> = {
  gpu: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan'],
  swiftshader: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader'],
}

/** Where the recording page is served, by Playwright's routing only (`.invalid` names no host). */
const ORIGIN = 'https://webgpu.presmium.invalid'
const PAGE = `<!doctype html><meta charset="utf-8"><title>presmium webgpu</title>
<script type="module">import * as gpu from '/gpu.mjs'; window.presmiumGpu = gpu</script>`

const require = createRequire(import.meta.url)
let chromium: BrowserType | undefined
let core: string | undefined

function browserType(): BrowserType {
  chromium ??= (require('playwright-chromium') as { chromium: BrowserType }).chromium
  return chromium
}

/** Whether Playwright's Chromium is installed (`pnpm exec playwright install chromium`). */
function installed(): boolean {
  try {
    return existsSync(browserType().executablePath())
  } catch {
    return false
  }
}

/** The environment of a browser started without a compiler's context: `PATH`, `LANG` and a temporary `HOME`. */
export function plainEnv(): Record<string, string> {
  const home = join(tmpdir(), 'presmium-home')
  mkdirSync(home, { recursive: true })
  return { PATH: process.env.PATH ?? '', LANG: process.env.LANG ?? 'C.UTF-8', HOME: home }
}

type GpuWindow = { presmiumGpu: { probeAdapter(gpu: unknown): Promise<AdapterDescription | undefined>, compute(gpu: unknown, request: ComputeRequest): Promise<ComputeOutcome> } }

/** Starts Chromium with `args` and `env`, opens the recording page, and closes the browser once `use` is done. */
async function withPage<T>(args: string[], env: Readonly<Record<string, string>>, use: (page: Page, browser: Browser) => Promise<T>): Promise<T> {
  const browser = await browserType().launch({ args, env: { ...env } })
  try {
    const page = await browser.newPage()
    core ??= readFileSync(new URL('../gpu.mjs', import.meta.url), 'utf8')
    await page.route(`${ORIGIN}/**`, route => route.fulfill(new URL(route.request().url()).pathname === '/gpu.mjs'
      ? { contentType: 'text/javascript', body: core }
      : { contentType: 'text/html', body: PAGE }))
    await page.goto(`${ORIGIN}/`)
    await page.waitForFunction(() => 'presmiumGpu' in window)
    return await use(page, browser)
  } finally {
    await browser.close()
  }
}

/** The browser and the adapter compile time records with. */
interface Runtime {
  args: string[]
  version: string
  adapter: AdapterDescription
}

/** The Chromium flags whose adapter records: the GPU's, else (`auto`) SwiftShader's. */
export async function findRuntime(choice: AdapterChoice, env: Readonly<Record<string, string>>): Promise<Runtime> {
  const tries = choice === 'auto' ? [CHROMIUM_ARGS.gpu, CHROMIUM_ARGS.swiftshader] : [CHROMIUM_ARGS[choice]]
  for (const args of tries) {
    const found = await withPage(args, env, async (page, browser) => ({
      version: `chromium ${browser.version()}`,
      adapter: await page.evaluate(() => (window as unknown as GpuWindow).presmiumGpu.probeAdapter((navigator as Navigator & { gpu?: unknown }).gpu)),
    }))
    if (found.adapter) return { args, version: found.version, adapter: found.adapter }
  }
  throw new Error(`Chromium has no WebGPU adapter (${choice === 'auto' ? 'neither the GPU nor SwiftShader' : choice})`)
}

/**
 * The executor of `wgsl` at compile time, `id` being `presmium.webgpu` or a
 * `kind: webgpu` environment's `presmium.env.<name>`.
 */
export function createRecorder(options: { id: string, adapter: AdapterChoice }): Executor {
  const { id } = options
  let runtime: Promise<Runtime> | undefined
  const find = (env: Readonly<Record<string, string>>) => {
    runtime ??= findRuntime(options.adapter, env).catch((error: unknown) => {
      runtime = undefined
      throw error
    })
    return runtime
  }
  return {
    id,
    supports: lang => isWgsl(lang) && installed(),
    async fingerprint() {
      const { version, adapter } = await find(plainEnv())
      return fingerprint(version, adapter)
    },
    async run(request, signal, ctx?: RunContext): Promise<RunResult> {
      const text = MESSAGES.en
      const made = computeRequest(request.code, request.args, text)
      if ('error' in made) return programError(id, made.error, 0)
      const env = ctx?.env ?? plainEnv()
      const { args } = await find(env)
      const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const started = Date.now()
      const outcome = await withPage(args, env, page => new Promise<ComputeOutcome | 'timeout' | 'cancelled'>((resolve, reject) => {
        // Closing the browser (once this settles) destroys the device of a run that went on.
        const timer = setTimeout(() => resolve('timeout'), timeoutMs)
        const cancel = () => resolve('cancelled')
        if (signal?.aborted) cancel()
        signal?.addEventListener('abort', cancel, { once: true })
        page.evaluate(req => (window as unknown as GpuWindow).presmiumGpu.compute((navigator as Navigator & { gpu?: unknown }).gpu, req), made.request)
          .then(resolve, reject)
          .finally(() => {
            clearTimeout(timer)
            signal?.removeEventListener('abort', cancel)
          })
      }))
      const durationMs = Date.now() - started
      if (outcome === 'timeout') return { ...failedRun(id, text.timedOut(timeoutMs), durationMs), timedOut: true }
      if (outcome === 'cancelled') return failedRun(id, text.cancelled, durationMs)
      // The adapter cannot run it: no result, so no failure is recorded (the compiler reports it).
      if (!outcome.ok && unavailable(outcome.reason)) throw new Error(`${failure(outcome, text)} (${outcome.adapter ? adapterName(outcome.adapter) : 'Chromium'})`)
      return runResult(id, outcome, durationMs, text)
    },
  }
}
