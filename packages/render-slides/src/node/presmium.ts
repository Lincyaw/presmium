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
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IRDocument, PresmiumNodePlugin, RenderContext } from '@presmium/kernel'
import { hasExtension, slidesBase, slidevMarkdown } from './slidev.ts'
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
    support: (node, extensions) => node.type === 'component' && !node.plugin && !hasExtension(node, extensions) ? 'degraded' : 'full',
    async prepare(doc, ctx) {
      await writeDeck(ctx.workDir, ctx, slidevMarkdown(doc, ctx, ctx.workDir))
    },
    async build(doc, ctx) {
      const dir = ctx.workDir
      await writeDeck(dir, ctx, slidevMarkdown(doc, ctx, dir))
      await rm(ctx.outDir, { recursive: true, force: true })
      await slidev(['build', 'slides.md', '--out', ctx.outDir, ...base(ctx)], dir)
      ctx.report({
        checkId: 'presmium.slides',
        severity: 'info',
        message: `Slidev deck in ${SLIDEV_DIR}/slides.md; export it with \`slidev export ${SLIDEV_DIR}/slides.md\``,
      })
      return { outDir: ctx.outDir, skipped: [] }
    },
    async dev(doc, ctx) {
      // In dev the work directory is the dev output directory, so a build does not disturb it.
      const dir = ctx.workDir
      await writeDeck(dir, ctx, slidevMarkdown(doc, ctx, dir))
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

function base(ctx: RenderContext): string[] {
  return typeof ctx.config.base === 'string' ? ['--base', slidesBase(ctx.config)] : []
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
async function writeDeck(dir: string, ctx: RenderContext, deck: SlidevDeck): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, '.gitignore'), '*\n')
  await writeFile(join(dir, 'vite.config.ts'), `export default { cacheDir: 'node_modules/.vite' }\n`)
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

/** Copies the local files the slides show into the deck's `public/`; their names hold their content hash, so a copy is never stale. */
async function publish(dir: string, assets: Map<string, string>): Promise<void> {
  for (const [name, file] of assets) {
    if (!existsSync(join(dir, 'public', name))) await copyFile(file, join(dir, 'public', name))
  }
}

function slidevBin(): string {
  const pkg = require.resolve('@slidev/cli/package.json')
  return join(dirname(pkg), (require(pkg) as { bin: { slidev: string } }).bin.slidev)
}

/** Runs the `slidev` command of @slidev/cli in `cwd`. */
function slidev(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [slidevBin(), ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => output += chunk)
    child.stderr.on('data', (chunk: Buffer) => output += chunk)
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`slidev ${args[0]} exited with code ${code}\n${output.slice(-4000)}`)))
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
