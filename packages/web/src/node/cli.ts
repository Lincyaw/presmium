import { spawn } from 'node:child_process'
import { existsSync, unwatchFile, watchFile } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { toWebDocument } from '../domain/index.ts'
import { DECK_ENTRY, loadDeck } from './deck.ts'
import { writeServiceWorker } from './offline.ts'
import { writeSite } from './site.ts'

const USAGE = `Usage: presmium-web <dev|build> [deckDir] [options]

Converts the deck (deckDir defaults to .) into a VitePress site: one page per
src: file, one section per slide, notes as body text.

Options:
  --out <dir>     build output directory (default: <deckDir>/dist-web)
  --base <path>   public base path (default: /)
  --port <port>   dev server port
  -h, --help      show this help

Exit codes: 0 success, 1 build failure, 2 usage error.`

interface Command {
  name: 'dev' | 'build'
  deckDir: string
  out: string
  base: string
  port?: string
}

function parseCommand(argv: string[]): Command | 'help' {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      base: { type: 'string', default: '/' },
      port: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) return 'help'
  const [name, deckDir = '.', ...extra] = positionals
  if (name !== 'dev' && name !== 'build') throw new Error(name ? `unknown command "${name}"` : 'missing command')
  if (extra.length > 0) throw new Error(`unexpected argument "${extra[0]}"`)
  const dir = resolve(deckDir)
  if (!existsSync(join(dir, DECK_ENTRY))) throw new Error(`${join(dir, DECK_ENTRY)} not found`)
  const base = `/${values.base.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/')
  return { name, deckDir: dir, out: resolve(values.out ?? join(dir, 'dist-web')), base, port: values.port }
}

function warn(message: string): void {
  process.stderr.write(`presmium-web: ${message}\n`)
}

/** Converts the deck and writes the VitePress project; returns its root and the deck's Markdown files. */
async function convert(command: Command): Promise<{ root: string, files: string[] }> {
  const deck = await loadDeck(command.deckDir, warn)
  const doc = toWebDocument(deck)
  const root = writeSite(deck, doc, { base: command.base })
  const sections = doc.pages.reduce((n, page) => n + page.sections.length, 0)
  const where = relative(process.cwd(), root)
  process.stdout.write(`presmium-web: ${doc.pages.length} pages, ${sections} sections in ${where.startsWith('..') ? root : where}\n`)
  return { root, files: deck.files }
}

/** Runs the VitePress command line, the documented interface of VitePress. */
function vitepress(args: string[]): Promise<number> {
  const require = createRequire(import.meta.url)
  const pkg = require.resolve('vitepress/package.json')
  const bin = join(dirname(pkg), (require(pkg) as { bin: Record<string, string> }).bin.vitepress!)
  return new Promise((done) => {
    const child = spawn(process.execPath, [bin, ...args], { stdio: 'inherit' })
    child.on('exit', code => done(code ?? 1))
    child.on('error', () => done(1))
  })
}

async function build(command: Command): Promise<number> {
  const { root } = await convert(command)
  const code = await vitepress(['build', root, '--outDir', command.out])
  if (code !== 0) return 1
  writeServiceWorker(command.out, command.base)
  return 0
}

async function dev(command: Command): Promise<number> {
  // Convert again when a Markdown file of the deck changes; VitePress then reloads the pages.
  // Polling also survives editors that replace files on save.
  const watched = new Set<string>()
  let timer: NodeJS.Timeout | undefined
  const changed = () => {
    clearTimeout(timer)
    timer = setTimeout(() => update().catch(error => warn(String(error))), 100)
  }
  const update = async () => {
    const { root, files } = await convert(command)
    for (const file of files.filter(f => !watched.has(f))) {
      watched.add(file)
      watchFile(file, { interval: 300 }, changed)
    }
    return root
  }
  const root = await update()
  const code = await vitepress(['dev', root, ...(command.port ? ['--port', command.port] : [])])
  watched.forEach(file => unwatchFile(file))
  return code
}

/** Runs `presmium-web <argv>` and returns the exit code. */
export async function main(argv: string[]): Promise<number> {
  let command: Command | 'help'
  try {
    command = parseCommand(argv)
  } catch (error) {
    process.stderr.write(`presmium-web: ${error instanceof Error ? error.message : String(error)}\n\n${USAGE}\n`)
    return 2
  }
  if (command === 'help') {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  try {
    return await (command.name === 'build' ? build(command) : dev(command))
  } catch (error) {
    warn(error instanceof Error ? error.stack ?? error.message : String(error))
    return 1
  }
}
