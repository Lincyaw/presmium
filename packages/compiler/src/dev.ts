import { existsSync, realpathSync, statSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { errorMessage } from '@lincyaw/kernel'
import type { Finding, RenderContext, RenderDevServer } from '@lincyaw/kernel'
import type { Compilation, Compiler } from './compiler.ts'
import { gitReadFiles } from './inputs.ts'
import { nodeVitePlugins, planRenderRun, renderContext, renderFinding, selectRenderers, translationsFor, vitePluginsFor, WEB, writeIR } from './renderers.ts'
import type { InstalledRenderer, RenderRun } from './renderers.ts'
import { viewFor } from './views.ts'

/** The renderers' dev servers for one deck, recompiling it when its files change. */
export interface DevServers {
  servers: { renderer: string, url: string }[]
  ir: string
  update(compilation: Compilation): Promise<void>
  close(): Promise<void>
}

export interface DevOptions {
  outDir: string
  to?: string[]
  server?: { url: string }
  onCompile?(compilation: Compilation, findings: Finding[]): void
  compilation?: Compilation
  base?: string
  port?: number
  preview?: { origins: string[] }
}

interface RunningServer {
  renderer: string
  url: string
  server: RenderDevServer
  ctx: RenderContext
}

/** Watches the directories of a set of files, since a file that does not exist yet cannot be watched itself. */
class FileWatcher {
  readonly #watchers = new Map<string, FSWatcher>()
  readonly #changed: () => void
  #names = new Map<string, Set<string>>()

  constructor(changed: () => void) {
    this.#changed = changed
  }

  watch(files: Iterable<string>): void {
    const names = new Map<string, Set<string>>()
    for (const file of files) {
      let dir = dirname(file)
      let name = basename(file)
      while (!existsSync(dir) && dirname(dir) !== dir) {
        name = basename(dir)
        dir = dirname(dir)
      }
      names.set(dir, (names.get(dir) ?? new Set<string>()).add(name))
    }
    this.#names = names
    for (const [dir, watcher] of this.#watchers) {
      if (names.has(dir)) continue
      watcher.close()
      this.#watchers.delete(dir)
    }
    for (const dir of names.keys()) {
      if (this.#watchers.has(dir)) continue
      try {
        this.#watchers.set(dir, watch(dir, (_event, name) => {
          if (name && this.#names.get(dir)?.has(basename(name))) this.#changed()
        }))
      } catch {
      }
    }
  }

  close(): void {
    for (const watcher of this.#watchers.values()) watcher.close()
  }
}

async function startDevServers(compilation: Compilation, selected: InstalledRenderer[], run: RenderRun, outDir: string, options: DevOptions, translations: NonNullable<RenderContext['translations']>, findings: Finding[]): Promise<RunningServer[]> {
  const servers: RunningServer[] = []
  for (const { renderer } of selected) {
    if (!renderer.dev) {
      findings.push(renderFinding(compilation, 'warning', `renderer ${renderer.id} has no dev server`))
      continue
    }
    const dir = join(outDir, renderer.id)
    const ctx = renderContext(compilation, renderer.id, dir, dir, run, findings, options.server)
    if (options.port !== undefined) ctx.config = { ...ctx.config, port: options.port }
    if (options.preview) ctx.preview = { origins: [...options.preview.origins] }
    if (renderer.id === WEB) {
      ctx.translations = translations
    }
    try {
      await mkdir(ctx.outDir, { recursive: true })
      const server = await renderer.dev(viewFor(compilation.doc, renderer.id), ctx)
      servers.push({ renderer: renderer.id, url: server.url, server, ctx })
    } catch (error) {
      findings.push(renderFinding(compilation, 'error', `renderer ${renderer.id} failed to start: ${errorMessage(error)}`))
    }
  }
  return servers
}

export async function dev(compiler: Compiler, options: DevOptions): Promise<DevServers> {
  await mkdir(options.outDir, { recursive: true })
  const outDir = realpathSync(options.outDir)
  let started = Date.now()
  let compilation = options.compilation ?? await compiler.compile()
  const ir = await writeIR(compilation.doc, outDir)
  const { selected, findings } = await selectRenderers(compilation, options.to)
  const run = planRenderRun(compilation, selected, false, options.base)
  const translators = new Map<string, Compiler>()
  let translated = await translationsFor(compilation, run, translators)
  findings.push(...translated.findings)
  const translations = translated.views
  const servers = await startDevServers(compilation, selected, run, outDir, options, translations, findings)
  if (servers.length === 0) findings.push(renderFinding(compilation, 'warning', `no renderer dev server; watching the source and writing the IR to ${ir}`))
  const setup = (c: Compilation) => JSON.stringify([c.doc.config.plugins, c.doc.config.renderers])
  const initial = setup(compilation)

  let timer: NodeJS.Timeout | undefined
  let running = Promise.resolve()
  let queued = false
  let closed = false
  const schedule = () => {
    if (closed) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (queued) return
      queued = true
      running = running.then(() => {
        queued = false
        clearTimeout(timer)
        return recompile()
      })
    }, 30)
  }
  const watcher = new FileWatcher(schedule)
  const watchFiles = async () => {
    const { files, gitReads } = compilation.inputs
    const git = await gitReadFiles(gitReads)
    if (closed) return
    const watched = new Set([...compilation.sourceFiles, ...files, ...git, ...translated.translations.flatMap(t => t.files)])
    watcher.watch(watched)
    if (!queued && [...watched].some(file => modifiedSince(file, started))) schedule()
  }
  const push = async (next: Compilation, reported: Finding[]) => {
    compilation = next
    await writeIR(compilation.doc, outDir)
    reported.push(...compilation.doc.diagnostics)
    translated = await translationsFor(compilation, run, translators)
    reported.push(...translated.findings)
    translations.splice(0, translations.length, ...translated.views)
    if (servers.length > 0 && setup(compilation) !== initial) {
      reported.push(renderFinding(compilation, 'warning', 'the plugins or renderers in the headmatter changed; restart presmium dev to load them in the dev servers'))
    }
    for (const { renderer, server, ctx } of servers) {
      ctx.vitePlugins = vitePluginsFor(compilation, finding => reported.push(finding))
      ctx.nodeVitePlugins = nodeVitePlugins(compilation)
      await server.update(viewFor(compilation.doc, renderer)).catch((error: unknown) => {
        reported.push(renderFinding(compilation, 'error', `renderer ${renderer} failed to update: ${errorMessage(error)}`))
      })
    }
  }
  const recompile = async () => {
    started = Date.now()
    const reported: Finding[] = []
    try {
      await push(await compiler.compile(), reported)
    } catch (error) {
      reported.push(renderFinding(compilation, 'error', errorMessage(error)))
    }
    await watchFiles()
    options.onCompile?.(compilation, reported)
  }
  if (!options.compilation) await watchFiles()
  options.onCompile?.(compilation, [...compilation.doc.diagnostics, ...findings])

  return {
    servers: servers.map(({ renderer, url }) => ({ renderer, url })),
    ir,
    async update(next) {
      if (closed) return
      const reported: Finding[] = []
      running = running.then(() => push(next, reported)).catch((error: unknown) => {
        reported.push(renderFinding(next, 'error', errorMessage(error)))
      })
      await running
      options.onCompile?.(compilation, reported)
    },
    async close() {
      closed = true
      clearTimeout(timer)
      watcher.close()
      await running
      await Promise.all(servers.map(s => s.server.close()))
    },
  }
}

function modifiedSince(file: string, time: number): boolean {
  const modified = statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0
  return modified >= time - 20 && modified <= Date.now()
}
