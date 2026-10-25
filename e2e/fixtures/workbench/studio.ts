// The workbench of e2e/workbench.spec.ts started as `presmium studio` starts it (docs/design-dsh.md 11.2), with the
// test harness of the bundle (packages/dsh/test/harness.ts): in a test home (HOME, DSH_HOME and XDG under a temporary
// directory), the workspace of e2e/fixtures/workbench/workspace (a git repository of its own), `presmium serve` with a
// service token and the workbench's origin as the previews' (`--preview-origin`), and DeepSeek
// Harness's web host with Presmium's bundle and profile, given the service. The page opens with the host's launch
// address; the first-use notice is read away.
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { PRESMIUM_BIN } from '../../../packages/cli/src/testing.ts'
import type { FakeModel } from '../../../packages/dsh/src/node/fake-model.ts'
import { writeProfile } from '../../../packages/dsh/src/node/launch.ts'
import { PACKAGE, running, testHome } from '../../../packages/dsh/test/harness.ts'
import type { Running, TestHome, Web, Workspace } from '../../../packages/dsh/test/harness.ts'

const FIXTURE = fileURLToPath(new URL('./workspace', import.meta.url))

/** The fixture workspace's files, by path. */
/** The files of a fixture, as bytes: a copy of an example has binary files (its narration's audio). */
function fixtureFiles(dir = FIXTURE): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  for (const name of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    // A copy made by an example's try.mjs links the repository's node_modules and has its own repository.
    if (name.split(/[\\/]/).some(part => part === 'node_modules' || part === '.git')) continue
    const path = join(dir, name)
    if (statSync(path).isFile()) files[relative(dir, path)] = readFileSync(path)
  }
  return files
}

export interface Studio {
  home: TestHome
  workspace: Workspace
  /** The workspace service and its token. */
  service: { url: string, token: string, process: Running }
  web: Web
  /** Opens the workbench in `page` (the host's cookie through its launch address); `welcome` keeps the first-use notice. */
  open(page: Page, options?: { welcome?: boolean }): Promise<void>
  close(): Promise<void>
}

/** `env` goes to the workbench (dsh), `serviceEnv` to the workspace service. */
/**
 * Where Playwright keeps its browsers for this machine (Playwright's documented defaults, or PLAYWRIGHT_BROWSERS_PATH):
 * a service with a test's own cache directory still finds them, e.g. for `slidev export`.
 */
export function playwrightBrowsers(): string {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ms-playwright')
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'ms-playwright')
}

export async function startStudio(options: { port: number, model?: FakeModel, patches?: string[], prefix?: string, fixture?: string, isolateClient?: boolean, env?: Record<string, string>, serviceEnv?: Record<string, string>, onServiceOutput?(text: string): void }): Promise<Studio> {
  const home = testHome(options.prefix ?? 'workbench')
  try {
    if (options.isolateClient) {
      // A concurrent client build must not make Harness hot-reload this test's bundle.
      const bundle = join(home.dir, 'bundle')
      mkdirSync(bundle, { recursive: true })
      for (const name of ['package.json', 'src', 'entries', 'build', 'skills', 'cordis.patch.yml', 'web.patch.yml', 'profile.patch.yml']) {
        // Packaged bundles include generated skills; source checkouts may not.
        if (name === 'skills' && !existsSync(join(PACKAGE, name))) continue
        cpSync(join(PACKAGE, name), join(bundle, name), { recursive: true })
      }
      symlinkSync(join(PACKAGE, 'node_modules'), join(bundle, 'node_modules'), 'junction')
      const profile = home.profile('web')
      writeProfile(home.dshHome, profile, 'web', bundle)
    }
    const workspace = home.workspace(options.prefix ?? 'workbench', fixtureFiles(options.fixture))
    // The copy's own components import packages from the node_modules it links.
    const linked = options.fixture && join(options.fixture, 'node_modules')
    if (linked && existsSync(linked)) symlinkSync(realpathSync(linked), join(workspace.dir, 'node_modules'), 'junction')
    const origin = `http://127.0.0.1:${options.port}`
    const token = randomBytes(24).toString('base64url')
    const process_ = running(spawn(process.execPath, [PRESMIUM_BIN, 'serve', workspace.dir, '--port', '0', '--preview-origin', origin], {
      cwd: workspace.dir,
      env: home.env({ ...options.serviceEnv, PRESMIUM_SERVICE_TOKEN: token }),
      stdio: ['ignore', 'pipe', 'pipe'],
    }))
    process_.child.stdout?.on('data', (chunk: Buffer) => options.onServiceOutput?.(chunk.toString()))
    process_.child.stderr?.on('data', (chunk: Buffer) => options.onServiceOutput?.(chunk.toString()))
    let web: Web | undefined
    try {
      const url = (await process_.wait(/^serve {2}(http\S+)$/m, 180_000))[1]!
      const root = (await process_.wait(/^workspace {2}(.+)$/m))[1]!.trim()
      web = await home.web(workspace.dir, options.port, {
        ...options.model ? { model: options.model } : {},
        ...options.patches ? { patches: options.patches } : {},
        env: { ...options.env, PRESMIUM_SERVICE_URL: url, PRESMIUM_SERVICE_TOKEN: token, PRESMIUM_WORKSPACE: root },
      })
      const started = web
      return {
        home,
        workspace,
        service: { url, token, process: process_ },
        web: started,
        async open(page, { welcome = false } = {}) {
          // The first-use notice was read in this browser before (unless the case looks at it).
          if (!welcome) await page.addInitScript(() => localStorage.setItem('presmium.workbench.welcomed', '1'))
          await page.goto(started.launch)
          // The application mounted (DeepSeek Harness's boot page is gone).
          await expect(page.locator('#root button').first()).toBeAttached({ timeout: 60_000 })
        },
        async close() {
          await process_.stop()
          await home.close()
        },
      }
    } catch (error) {
      await process_.stop()
      throw error
    }
  } catch (error) {
    await home.close()
    throw error
  }
}
