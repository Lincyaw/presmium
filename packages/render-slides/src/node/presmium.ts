/**
 * The slides renderer (docs/ir.md section 6): writes the IR as a Slidev deck
 * to `<deck>/.presmium/slides/slides.md` and builds it with the Slidev CLI
 * into the renderer's output directory. The deck stays in place, so
 * `slidev export` (PDF, PPTX, PNG) and `slidev` (drawing, recording) work on
 * it; `prepare` writes it without building. `presmium dev` runs Slidev's dev
 * server on a deck of its own, rewritten on every change of the source;
 * Slidev updates the open slides. The dev servers of the workspace service
 * (`RenderContext.preview`) load the agent of the preview protocol, in a
 * setup of the generated deck that no build has (docs/design-dsh.md 4.6).
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { errorMessage, irBlocks, isRecord, nodeMdast, previewFrameAncestors, PREVIEW_REVISION } from '@presmium/kernel'
import type { IRDocument, LocalAsset, MdastNode, PresmiumNodePlugin, RenderContext } from '@presmium/kernel'
import { copyPublished, FONT_LICENSE, fontLicense, optimizeDeps, TYPESCRIPT_IMPORT } from '@presmium/kernel/node'
import { addonDirs, hasExtension, previewDocument, slidevMarkdown } from './slidev.ts'
import type { SlidevDeck } from './slidev.ts'

/** Directory of the generated Slidev deck, relative to the deck directory. */
export const SLIDEV_DIR = '.presmium/slides'

/** The host adapter of the slides form, whose client has the slides' preview agent. */
const ADDON_CORE = '@presmium/slidev-addon-core'
/** The file of a preview's deck that holds the revision of the IR it shows (`PREVIEW_REVISION`), which its pages get over Vite's WebSocket. */
const PREVIEW_FILE = 'preview.json'

const STYLE = fileURLToPath(new URL('../deck/style.css', import.meta.url))
/** This package, whose default theme the slides load. */
const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: 'presmium.slides',
  version,
  kernel: '^1.0.0',
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
      await writeRevision(dir, ctx, doc)
      const port = Number(ctx.config.port)
      const server = await slidevDev(dir, [...Number.isInteger(port) && port > 0 ? ['--port', String(port)] : [], ...base(ctx)])
      return {
        url: server.url,
        async update(next) {
          // Slidev watches slides.md and hot updates the slides that changed; a preview's pages then get the revision.
          const deck = slidevMarkdown(next, ctx, dir)
          await publish(dir, deck.assets)
          const file = join(dir, 'slides.md')
          if (await readFile(file, 'utf8').catch(() => '') !== deck.markdown) await writeFile(file, deck.markdown)
          await writeRevision(dir, ctx, next)
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
  const packages = [PACKAGE_DIR, ...addonDirs(doc, ctx)]
  const optimize = optimizeDeps(dir, packages)
  await writeFile(join(dir, 'vite.config.ts'), viteConfig(ctx, await vitePluginEntries(ctx, doc.config.presmium), optimize, allowed(ctx, packages)))
  await copyFile(STYLE, join(dir, 'style.css'))
  await rm(join(dir, 'public'), { recursive: true, force: true })
  await mkdir(join(dir, 'public'))
  const shared = join(ctx.deckDir, 'public')
  for (const entry of await readdir(shared).catch(() => [])) await symlink(join(shared, entry), join(dir, 'public', entry), 'junction')
  await publish(dir, deck.assets)
  // The fonts the design system bundles go with their license (NOTICE), unless the deck's own `public/` has the path.
  const license = join(dir, 'public', FONT_LICENSE)
  if (!existsSync(join(dir, 'public', FONT_LICENSE.split('/')[0]!))) {
    await mkdir(dirname(license), { recursive: true })
    await writeFile(license, fontLicense(import.meta.url))
  }
  await rm(join(dir, 'components'), { recursive: true, force: true })
  if (existsSync(join(ctx.deckDir, 'components'))) await symlink(join(ctx.deckDir, 'components'), join(dir, 'components'), 'junction')
  await writePreviewSetup(dir, ctx)
  await writeFile(join(dir, 'slides.md'), deck.markdown)
}

/**
 * The preview agent in a preview's deck (`RenderContext.preview`): a root
 * setup of the deck's own, which imports it from the slides' host adapter
 * and starts it with the origins and the document. Without a preview the
 * setup is not there, so no build and no `presmium dev` has the agent; nor
 * does a deck without the host adapter.
 */
async function writePreviewSetup(dir: string, ctx: RenderContext): Promise<void> {
  await rm(join(dir, 'setup'), { recursive: true, force: true })
  await rm(join(dir, PREVIEW_FILE), { force: true })
  const core = ctx.pluginDirs[ADDON_CORE]
  if (!ctx.preview || !core) return
  const agent = join(core, 'src/client/preview.ts')
  const options = { origins: ctx.preview.origins, document: previewDocument(ctx) }
  await mkdir(join(dir, 'setup'))
  await writeFile(join(dir, 'setup/root.ts'), `// Generated by @presmium/render-slides for a preview of the workspace service; do not edit.
import { startSlidesPreview } from ${JSON.stringify(agent)}

export default function () {
  startSlidesPreview(${JSON.stringify(options)})
}
`)
}

/** The revision of the IR a preview's slides show, for its pages (`PREVIEW_FILE`). */
async function writeRevision(dir: string, ctx: RenderContext, doc: IRDocument): Promise<void> {
  if (!ctx.preview) return
  const revision = doc.meta[PREVIEW_REVISION]
  const json = `${JSON.stringify(typeof revision === 'string' ? { revision } : {})}\n`
  const file = join(dir, PREVIEW_FILE)
  if (await readFile(file, 'utf8').catch(() => '') !== json) await writeFile(file, json)
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
 * What the dev server may serve besides Slidev's own roots (`server.fs.allow`):
 * the deck (its linked `components/`), and the node_modules directories where
 * the theme and the addons are installed, as from npm, with what they import
 * (the fonts of @presmium/host). Slidev allows the project of the generated
 * deck, which `presmium dev --out` may put outside the deck's project.
 */
function allowed(ctx: RenderContext, packages: string[]): string[] {
  const installed = packages.flatMap((dir) => {
    const parts = realpathSync(dir).split(sep)
    const at = parts.indexOf('node_modules')
    return at < 0 ? [] : [parts.slice(0, at + 1).join(sep)]
  })
  return [...new Set([ctx.deckDir, ...installed])]
}

/**
 * The generated deck's `vite.config.ts` (Slidev merges it with its own,
 * vendor/docs/slidev/custom/config-vite.md): a Vite cache of its own; the
 * Vite plugins of the deck's plugins (`vitePlugins` of their Node entries,
 * with their configuration), the one way a plugin adds Vite plugins to
 * either form; and, in `presmium dev`, the paths of `/__presmium/` proxied
 * to the Presmium server, WebSockets too (docs/architecture.md 10.1), and
 * the directories it may serve (`allow`); for the Presmium packages
 * installed under node_modules, as from npm, the browser dependencies the
 * dev server pre-bundles, and the packages themselves, which it never does
 * (`optimizeDeps`).
 */
function viteConfig(ctx: RenderContext, entries: VitePluginsEntry[], optimize: { include: string[], exclude: string[] }, allow: string[]): string {
  const imports = entries.map(({ file }, i) => `import plugin${i} from ${JSON.stringify(file)}\n`).join('')
  const deck = JSON.stringify({ deckDir: ctx.deckDir, workspaceRoot: ctx.workspaceRoot })
  const plugins = entries.map(({ config }, i) => `    ...(plugin${i}.vitePlugins?.({ ...deck, config: ${JSON.stringify(config)} }) ?? []),\n`).join('')
  const server = {
    ...ctx.server ? { proxy: { '^/__presmium/': { target: ctx.server.url, ws: true } }, fs: { allow } } : {},
    // A preview's pages may be framed by the workbench's origins only (docs/design-dsh.md 4.5).
    ...ctx.preview ? { headers: { 'Content-Security-Policy': previewFrameAncestors(ctx.preview.origins) } } : {},
  }
  const served = Object.keys(server).length > 0 ? `  server: ${JSON.stringify(server)},\n` : ''
  const optimized = optimize.exclude.length > 0 ? `  optimizeDeps: ${JSON.stringify(optimize)},\n` : ''
  const preview = ctx.preview ? `    presmiumPreview(),\n` : ''
  return `${imports}${ctx.preview ? previewPlugin() : ''}\nconst deck = ${deck}\n\nexport default {\n  cacheDir: 'node_modules/.vite',\n  plugins: [\n${preview}${plugins}  ],\n${served}${optimized}}\n`
}

/**
 * The Vite plugin of a preview's deck: the revision of the IR its slides show
 * (`PREVIEW_FILE`), sent to a page that asks (`presmium:preview`) and to
 * every page when it changes (`presmium:revision`), a moment after the
 * slides it goes with, so the page has taken them.
 */
function previewPlugin(): string {
  return `import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function presmiumPreview() {
  const file = fileURLToPath(new URL(${JSON.stringify(`./${PREVIEW_FILE}`)}, import.meta.url))
  const read = () => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      return {}
    }
  }
  return {
    name: 'presmium:preview',
    configureServer(server) {
      server.ws.on('presmium:preview', (_data, client) => client.send('presmium:revision', read()))
      server.watcher.add(file)
      let timer
      server.watcher.on('change', (changed) => {
        if (changed !== file) return
        clearTimeout(timer)
        timer = setTimeout(() => server.ws.send('presmium:revision', read()), 150)
      })
    },
  }
}
`
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
    const child = spawn(process.execPath, [...TYPESCRIPT_IMPORT, slidevBin(), ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => output += chunk)
    child.stderr.on('data', (chunk: Buffer) => output += chunk)
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new SlidevError(`slidev ${args[0]} exited with code ${code}`, output)))
  })
}

/** `slidev slides.md` in `dir`; resolves with the URL it serves once it listens (Slidev takes the next free port). */
function slidevDev(dir: string, args: string[]): Promise<{ url: string, close(): Promise<void> }> {
  const child: ChildProcess = spawn(process.execPath, [...TYPESCRIPT_IMPORT, slidevBin(), 'slides.md', ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
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
