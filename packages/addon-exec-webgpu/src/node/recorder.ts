import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { deckLocale, failedRun } from '@lincyaw/kernel'
import type { Executor, RunContext, RunResult } from '@lincyaw/kernel'
import { minimalRunEnv } from '@lincyaw/kernel/node'
import type { Browser, BrowserType, Page } from 'playwright-chromium'
import { adapterFingerprint, adapterName, computeRequest, DEFAULT_TIMEOUT_MS, failureText, isUnavailable, isWgsl, MESSAGES, programError, runResultOf } from '../domain/index.ts'
import type { AdapterChoice, AdapterDescription, ComputeOutcome, ComputeRequest } from '../domain/index.ts'

const CHROMIUM_ARGS: Record<Exclude<AdapterChoice, 'auto'>, string[]> = {
  gpu: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan'],
  swiftshader: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader'],
}

const ORIGIN = 'https://webgpu.presmium.invalid'
const PAGE = `<!doctype html><meta charset="utf-8"><title>presmium webgpu</title>
<script type="module">import * as gpu from '/gpu-compute.mjs'; window.presmiumGpu = gpu</script>`

const require = createRequire(import.meta.url)
let chromium: BrowserType | undefined
let core: string | undefined

function browserType(): BrowserType {
  chromium ??= (require('playwright-chromium') as { chromium: BrowserType }).chromium
  return chromium
}

function installed(): boolean {
  try {
    return existsSync(browserType().executablePath())
  } catch {
    return false
  }
}

type GpuWindow = { presmiumGpu: { probeAdapter(gpu: unknown): Promise<AdapterDescription | undefined>, compute(gpu: unknown, request: ComputeRequest): Promise<ComputeOutcome> } }

async function withPage<T>(args: string[], env: Readonly<Record<string, string>>, use: (page: Page, browser: Browser) => Promise<T>): Promise<T> {
  const browser = await browserType().launch({ args, env: { ...env } })
  try {
    const page = await browser.newPage()
    core ??= readFileSync(new URL('../shared/gpu-compute.mjs', import.meta.url), 'utf8')
    await page.route(`${ORIGIN}/**`, route => route.fulfill(new URL(route.request().url()).pathname === '/gpu-compute.mjs'
      ? { contentType: 'text/javascript', body: core }
      : { contentType: 'text/html', body: PAGE }))
    await page.goto(`${ORIGIN}/`)
    await page.waitForFunction(() => 'presmiumGpu' in window)
    return await use(page, browser)
  } finally {
    await browser.close()
  }
}

/** Chromium's arguments that give it a WebGPU adapter, its version and the adapter. */
export interface ChromiumAdapter {
  args: string[]
  version: string
  adapter: AdapterDescription
}

/** Launches Chromium to find its WebGPU adapter: the GPU, SwiftShader, or with `auto` the GPU and else SwiftShader. */
export async function findChromiumAdapter(choice: AdapterChoice, env: Readonly<Record<string, string>>): Promise<ChromiumAdapter> {
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

/** Records WGSL runs at compile time: each run in a new Chromium page, with the adapter found once. */
export function createChromiumExecutor(options: { id: string, adapter: AdapterChoice }): Executor {
  const { id } = options
  let found: Promise<ChromiumAdapter> | undefined
  const find = (env: Readonly<Record<string, string>>) => {
    found ??= findChromiumAdapter(options.adapter, env).catch((error: unknown) => {
      found = undefined
      throw error
    })
    return found
  }
  return {
    id,
    supports: lang => isWgsl(lang) && installed(),
    async fingerprint() {
      const { version, adapter } = await find(minimalRunEnv())
      return adapterFingerprint(version, adapter)
    },
    async run(request, signal, ctx?: RunContext): Promise<RunResult> {
      const text = MESSAGES[ctx?.lang ? deckLocale(ctx.lang) : 'en']
      const made = computeRequest(request.code, request.args, text)
      if ('error' in made) return programError(id, made.error, 0)
      const env = ctx?.env ?? minimalRunEnv()
      const { args } = await find(env)
      const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const started = Date.now()
      const outcome = await withPage(args, env, page => new Promise<ComputeOutcome | 'timeout' | 'cancelled'>((resolve, reject) => {
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
      if (!outcome.ok && isUnavailable(outcome.reason)) throw new Error(`${failureText(outcome, text)} (${outcome.adapter ? adapterName(outcome.adapter) : 'Chromium'})`)
      return runResultOf(id, outcome, durationMs, text)
    },
  }
}
