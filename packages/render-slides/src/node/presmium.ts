/**
 * The slides renderer (docs/ir.md section 6): writes the IR as a Slidev deck
 * to `<deck>/.presmium/slides/slides.md` and builds it with the Slidev CLI
 * into the renderer's output directory. The deck stays in place, so
 * `slidev export` (PDF, PPTX, PNG) and `slidev` (drawing, recording) work on
 * it; `prepare` writes it without building. `presmium dev` runs Slidev's dev
 * server on a deck of its own, rewritten on every change of the source;
 * Slidev updates the open slides.
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { errorMessage, irBlocks, isRecord, nodeMdast } from '@presmium/kernel'
import type { IRDocument, LocalAsset, MdastNode, PresmiumNodePlugin, RenderContext } from '@presmium/kernel'
import { copyPublished } from '@presmium/kernel/node'
import { hasExtension, slidevMarkdown } from './slidev.ts'
import type { SlidevDeck } from './slidev.ts'

/** Directory of the generated Slidev deck, relative to the deck directory. */
export const SLIDEV_DIR = '.presmium/slides'

const STYLE = fileURLToPath(new URL('../deck/style.css', import.meta.url))
const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: 'presmium.slides',
  version,
  kernel: '^0.1.0',
  renderer: {
    id: 'slides',
    site: true,
    support: (node, extensions) => node.type === 'component' && !node.plugin && !hasExtension(node, extensions) ? 'degraded' : 'full',
    async prepare(doc, ctx) {
      await writeDeck(ctx.workDir, ctx, slidevMarkdown(doc, ctx, ctx.workDir), doc)
    },
    async build(doc, ctx) {
      const dir = ctx.workDir
      await writeDeck(dir, ctx, slidevMarkdown(doc, ctx, dir), doc)
      await rm(ctx.outDir, { recursive: true, force: true })
      await slidev(['build', 'slides.md', '--out', ctx.outDir, ...base(ctx)], dir).catch((error: unknown) => {
        throw located(error, doc, ctx)
      })
      ctx.report({
        checkId: 'presmium.slides',
        severity: 'info',
        // `slidev export` serves the deck at the root: a deck written for another base links its local files there.
        message: ctx.base === '/'
          ? `Slidev deck in ${SLIDEV_DIR}/slides.md; export it with \`slidev export ${SLIDEV_DIR}/slides.md\``
          : `Slidev deck in ${SLIDEV_DIR}/slides.md, written for the base ${ctx.base}; \`slidev export\` serves it at the root, where the local files it links are not found: export with \`presmium-export\` (@presmium/slidev-addon-publish)`,
      })
      return { outDir: ctx.outDir, skipped: [] }
    },
    async dev(doc, ctx) {
      // In dev the work directory is the dev output directory, so a build does not disturb it.
      const dir = ctx.workDir
      await writeDeck(dir, ctx, slidevMarkdown(doc, ctx, dir), doc)
      const port = Number(ctx.config.port)
      const server = await slidevDev(dir, [...Number.isInteger(port) && port > 0 ? ['--port', String(port)] : [], ...base(ctx)])
      return {
        url: server.url,
        async update(next) {
          // Slidev watches slides.md and hot updates the slides that changed.
          const deck = slidevMarkdown(next, ctx, dir)
          await publish(dir, deck.assets)
          const file = join(dir, 'slides.md')
          if (await readFile(file, 'utf8').catch(() => '') !== deck.markdown) await writeFile(file, deck.markdown)
        },
        close: server.close,
      }
    },
  },
}

export default plugin

/** Whether a tree holds raw HTML. */
const hasHtml = (node: MdastNode): boolean => node.type === 'html' || (node.children ?? []).some(hasHtml)

/**
 * A failed `slidev build` that names a slide of the generated deck
 * (`slides.md__slidev_<n>.md`, Slidev's module of slide n): the error is
 * reported in the source, at the block of that section that holds raw HTML
 * when only one does (Slidev compiles it as a Vue template), else at the
 * section; the build fails with a short message. Other failures stay as
 * they are.
 */
function located(error: unknown, doc: IRDocument, ctx: RenderContext): unknown {
  // The whole output: the line that names the slide may lie far before the end, which the message keeps.
  const output = error instanceof SlidevError ? error.output : errorMessage(error)
  const at = /slides\.md__slidev_(\d+)\.md(?::\d+(?::\d+)?)?\s*\n(?:\w*Error: )?([^\n]+)/.exec(output)
  const section = at && doc.sections[Number(at[1]) - 1]
  if (!at || !section) return error
  const reason = at[2]!.replace(/^\w*Error: /, '').trim()
  const raw = [...irBlocks(section.blocks)].filter(block => block.role === 'visual' && nodeMdast(block.node).some(hasHtml))
  const source = raw.length === 1 ? raw[0]!.source : section.source
  ctx.report({
    checkId: 'presmium.slides',
    severity: 'error',
    message: `slide ${at[1]} (${section.title || section.id}) does not build: ${reason}`,
    source: { file: source.file, line: source.line },
  })
  return new Error(`slidev build failed at slide ${at[1]}: ${reason}`)
}

/** The public base of the slides (`RenderContext.base`; C-13). */
function base(ctx: RenderContext): string[] {
  return ctx.base !== '/' ? ['--base', ctx.base] : []
}

/**
 * Writes `slides.md` and the deck's styles into `dir`, ignored by git. Its
 * `public/` holds the entries of the deck's `public/` (linked), so `/...`
 * assets resolve, and the local files the slides show (copied, R-06); the
 * deck's own `components/` is linked, where Slidev registers components. The
 * Vite cache is the deck's own: Slidev's default lies in the @slidev/cli
 * package, so a `slidev export` would otherwise disturb any other Slidev dev
 * server running.
 */
async function writeDeck(dir: string, ctx: RenderContext, deck: SlidevDeck, doc: IRDocument): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, '.gitignore'), '*\n')
  await writeFile(join(dir, 'vite.config.ts'), viteConfig(ctx, await vitePluginEntries(ctx, doc.config.presmium)))
  await copyFile(STYLE, join(dir, 'style.css'))
  await rm(join(dir, 'public'), { recursive: true, force: true })
  await mkdir(join(dir, 'public'))
  const shared = join(ctx.deckDir, 'public')
  for (const entry of await readdir(shared).catch(() => [])) await symlink(join(shared, entry), join(dir, 'public', entry), 'junction')
  await publish(dir, deck.assets)
  await rm(join(dir, 'components'), { recursive: true, force: true })
  if (existsSync(join(ctx.deckDir, 'components'))) await symlink(join(ctx.deckDir, 'components'), join(dir, 'components'), 'junction')
  await writeFile(join(dir, 'slides.md'), deck.markdown)
}

/** A plugin's Node entry (`./presmium`) that adds Vite plugins (`PresmiumNodePlugin.vitePlugins`), with the plugin's configuration. */
interface VitePluginsEntry {
  /** Absolute path of the entry. */
  file: string
  config: Record<string, unknown>
}

/** The Node entry (`./presmium`) of the plugin package in `dir`, if it has one. */
async function nodeEntry(dir: string): Promise<string | undefined> {
  const manifest: unknown = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8').catch(() => '{}'))
  const exports = isRecord(manifest) ? manifest.exports : undefined
  const entry = isRecord(exports) ? exports['./presmium'] : undefined
  return typeof entry === 'string' ? resolve(dir, entry) : undefined
}

/**
 * The plugins whose Node entry adds Vite plugins, with their configuration
 * (`presmium.<id>`), in the order of the deck's plugins. The compiler's
 * `ctx.vitePlugins` says whether any does; Slidev runs Vite in a process of
 * its own, where the generated deck's configuration imports these entries
 * and calls their `vitePlugins`, as the web form's does (architecture 4.2).
 */
async function vitePluginEntries(ctx: RenderContext, presmium: Record<string, unknown>): Promise<VitePluginsEntry[]> {
  if (ctx.vitePlugins.length === 0) return []
  const entries: VitePluginsEntry[] = []
  for (const name of ctx.plugins) {
    const dir = ctx.pluginDirs[name]
    const file = dir && await nodeEntry(dir)
    if (!file) continue
    // The compiler has loaded the module already: this is the same one.
    const plugin = (await import(pathToFileURL(file).href).catch(() => ({}))).default as PresmiumNodePlugin | undefined
    if (typeof plugin?.vitePlugins !== 'function') continue
    const config = presmium[plugin.id]
    entries.push({ file, config: isRecord(config) ? config : {} })
  }
  return entries
}

/**
 * The generated deck's `vite.config.ts` (Slidev merges it with its own,
 * vendor/docs/slidev/custom/config-vite.md): a Vite cache of its own; the
 * Vite plugins of the deck's plugins (`vitePlugins` of their Node entries,
 * with their configuration), the one way a plugin adds Vite plugins to
 * either form; and, in `presmium dev`, the paths of `/__presmium/` proxied
 * to the Presmium server, WebSockets too (docs/architecture.md 10.1).
 */
function viteConfig(ctx: RenderContext, entries: VitePluginsEntry[]): string {
  const imports = entries.map(({ file }, i) => `import plugin${i} from ${JSON.stringify(file)}\n`).join('')
  const deck = JSON.stringify({ deckDir: ctx.deckDir, workspaceRoot: ctx.workspaceRoot })
  const plugins = entries.map(({ config }, i) => `    ...(plugin${i}.vitePlugins?.({ ...deck, config: ${JSON.stringify(config)} }) ?? []),\n`).join('')
  const proxy = ctx.server ? `  server: { proxy: { '^/__presmium/': { target: ${JSON.stringify(ctx.server.url)}, ws: true } } },\n` : ''
  return `${imports}\nconst deck = ${deck}\n\nexport default {\n  cacheDir: 'node_modules/.vite',\n  plugins: [\n${plugins}  ],\n${proxy}}\n`
}

/**
 * Copies the local files the slides show into the deck's `public/` (a
 * directory with its file listing); their names hold their content hash, so
 * a copy is never stale.
 */
async function publish(dir: string, assets: Map<string, LocalAsset>): Promise<void> {
  for (const found of assets.values()) copyPublished(found, join(dir, 'public'))
}

function slidevBin(): string {
  const pkg = require.resolve('@slidev/cli/package.json')
  return join(dirname(pkg), (require(pkg) as { bin: { slidev: string } }).bin.slidev)
}

/** A failed `slidev` command: the end of its output in the message, all of it in `output`. */
class SlidevError extends Error {
  readonly output: string
  constructor(message: string, output: string) {
    super(`${message}\n${output.slice(-4000)}`)
    this.output = output
  }
}

/** Runs the `slidev` command of @slidev/cli in `cwd`; rejects with a `SlidevError` when it fails. */
function slidev(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [slidevBin(), ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => output += chunk)
    child.stderr.on('data', (chunk: Buffer) => output += chunk)
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new SlidevError(`slidev ${args[0]} exited with code ${code}`, output)))
  })
}

/** `slidev slides.md` in `dir`; resolves with the URL it serves once it listens (Slidev takes the next free port). */
function slidevDev(dir: string, args: string[]): Promise<{ url: string, close(): Promise<void> }> {
  const child: ChildProcess = spawn(process.execPath, [slidevBin(), 'slides.md', ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  const close = async () => {
    if (child.exitCode === null) child.kill('SIGTERM')
    await exited
  }
  return new Promise((resolve, reject) => {
    // Output is kept until the server is ready, for the error message; later output is dropped.
    let output: string | undefined = ''
    child.stderr!.on('data', (chunk: Buffer) => {
      if (output !== undefined) output += chunk
    })
    child.stdout!.on('data', (chunk: Buffer) => {
      if (output === undefined) return
      output += chunk
      // The address Slidev prints for its slide show, colors stripped.
      const url = /(http:\/\/localhost:\d+\/\S*)/.exec(output.replace(/\x1B\[[\d;]*m/g, ''))?.[1]
      if (!url) return
      output = undefined
      resolve({ url, close })
    })
    child.once('error', reject)
    child.once('exit', code => reject(new Error(`slidev exited with code ${code}\n${output?.slice(-4000) ?? ''}`)))
  })
}
