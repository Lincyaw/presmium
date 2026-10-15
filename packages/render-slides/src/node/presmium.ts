/**
 * The slides renderer (docs/ir.md section 6): writes the IR as a Slidev deck
 * to `<deck>/.presmium/slides/slides.md` and builds it with the Slidev CLI
 * into the renderer's output directory. The deck stays in place, so
 * `slidev export` (PDF, PPTX, PNG) and `slidev` (drawing, recording) work on it.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { extensionFor, slidevMarkdown } from './slidev.ts'

/** Directory of the generated Slidev deck, relative to the deck directory. */
export const SLIDEV_DIR = '.presmium/slides'

const plugin: PresmiumNodePlugin = {
  id: 'presmium.slides',
  renderer: {
    id: 'slides',
    support: (node, extensions) => node.type === 'component' && !node.plugin && !extensionFor(node, extensions) ? 'degraded' : 'full',
    async build(doc, ctx) {
      const dir = join(ctx.deckDir, SLIDEV_DIR)
      await writeDeck(dir, ctx.deckDir, slidevMarkdown(doc, { dir, deckDir: ctx.deckDir, config: ctx.config, extensions: ctx.extensions }))
      await rm(ctx.outDir, { recursive: true, force: true })
      const base = typeof ctx.config.base === 'string' ? ['--base', ctx.config.base] : []
      await slidev(['build', 'slides.md', '--out', ctx.outDir, ...base], dir)
      ctx.report({
        checkId: 'presmium.slides',
        severity: 'info',
        message: `Slidev deck in ${SLIDEV_DIR}/slides.md; export it with \`slidev export ${SLIDEV_DIR}/slides.md\``,
      })
      return { outDir: ctx.outDir, skipped: [] }
    },
  },
}

export default plugin

/**
 * Writes `slides.md` into `dir`, ignored by git. The deck's `public/` is linked so `/...`
 * assets resolve. The Vite cache is the deck's own: Slidev's default lies in the @slidev/cli
 * package, so a `slidev export` would otherwise disturb any other Slidev dev server running.
 */
async function writeDeck(dir: string, deckDir: string, markdown: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, '.gitignore'), '*\n')
  await writeFile(join(dir, 'vite.config.ts'), `export default { cacheDir: 'node_modules/.vite' }\n`)
  await rm(join(dir, 'public'), { force: true })
  if (existsSync(join(deckDir, 'public'))) await symlink(join(deckDir, 'public'), join(dir, 'public'), 'junction')
  await writeFile(join(dir, 'slides.md'), markdown)
}

const require = createRequire(import.meta.url)

/** Runs the `slidev` command of @slidev/cli in `cwd`. */
function slidev(args: string[], cwd: string): Promise<void> {
  const pkg = require.resolve('@slidev/cli/package.json')
  const bin = join(dirname(pkg), (require(pkg) as { bin: { slidev: string } }).bin.slidev)
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => output += chunk)
    child.stderr.on('data', (chunk: Buffer) => output += chunk)
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`slidev ${args[0]} exited with code ${code}\n${output.slice(-4000)}`)))
  })
}
