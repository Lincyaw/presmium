import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { Compiler, DECK_ENTRY, viewFor } from '@lincyaw/compiler'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { diffReport, pageStatus, pairPages, parsePageFile, parseWebFile, reportMarkdown } from '../domain/index.ts'
import type { DiffSide, PageRef, VisualDiff, VisualDiffReport } from '../domain/index.ts'
import { hasForm } from './deck.ts'
import { git, run } from './process.ts'
import { exportSlides } from './export.ts'
import { captureWeb } from './web-capture.ts'

export interface DiffJob {
  refA: string
  refB: string
  deckDir: string
  out?: string
  threshold?: number
  wait?: number
  install?: boolean
}

export async function visualDiff(job: DiffJob): Promise<{ report: VisualDiffReport, out: string, warnings: string[] }> {
  const deckDir = resolve(job.deckDir)
  const root = await git(deckDir, 'rev-parse', '--show-toplevel')
  const sides = await Promise.all([job.refA, job.refB].map(async (ref): Promise<DiffSide> => {
    const commit = await git(deckDir, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`).catch(() => '')
    if (!commit) throw new Error(`unknown revision "${ref}"`)
    return { ref, commit }
  }))
  const warnings = job.install ? [] : await outsideDeckWarnings(root, deckDir, sides[0]!.commit, sides[1]!.commit)

  const work = join(deckDir, '.presmium', 'diff')
  const out = resolve(job.out ?? work)
  if (out !== work && existsSync(out) && (await readdir(out)).length > 0 && !existsSync(join(out, 'report.json'))) {
    throw new Error(`${out} is not empty and holds no previous report; choose another --out`)
  }
  await mkdir(work, { recursive: true })
  await writeFile(join(work, '.gitignore'), '*\n')
  for (const dir of ['a', 'b', 'diff']) await rm(join(out, dir), { recursive: true, force: true })

  const sections = new Map<string, number>()
  for (const [label, side] of [['a', sides[0]!], ['b', sides[1]!]] as const) {
    const checkout = join(work, `checkout-${label}`)
    await removeWorktree(root, checkout)
    await git(root, 'worktree', 'add', '--detach', '--force', checkout, side.commit)
    try {
      const deck = join(checkout, relative(root, deckDir))
      if (!existsSync(join(deck, DECK_ENTRY))) throw new Error(`${side.ref} has no ${relative(root, join(deckDir, DECK_ENTRY))}`)
      if (job.install) await run(lockfileDir(deck, checkout), 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline'])
      const compilation = await new Compiler(deck).compile()
      const wait = job.wait ?? 500
      if (hasForm(compilation, 'slides')) {
        await exportSlides(compilation, { deckDir: deck, format: 'png', withClicks: true, output: join(out, label) })
      }
      if (hasForm(compilation, 'web')) {
        for (const section of viewFor(compilation.doc, 'web').sections) sections.set(section.id, section.index)
        warnings.push(...(await captureWeb(compilation, join(work, `web-${label}`), join(out, label, 'web'), wait)).map(w => `${side.ref}: ${w}`))
      }
    } finally {
      await removeWorktree(root, checkout)
    }
  }

  const threshold = job.threshold ?? 0
  const pages = [...await comparePages(out, '', threshold, parsePageFile), ...await comparePages(out, 'web', threshold, name => parseWebFile(name, sections))]
  const report = diffReport(sides[0]!, sides[1]!, threshold, pages)
  await writeFile(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(join(out, 'report.md'), reportMarkdown(report))
  return { report, out, warnings }
}

/** Warns of the changes between the commits outside the deck, which render from the installed packages. */
async function outsideDeckWarnings(root: string, deckDir: string, a: string, b: string): Promise<string[]> {
  const deck = relative(root, deckDir)
  if (!deck) return []
  const files = (await git(root, 'diff', '--name-only', a, b, '--', '.', `:(exclude)${deck}`)).split('\n').filter(Boolean)
  if (files.length === 0) return []
  const shown = files.slice(0, 3).join(', ') + (files.length > 3 ? `, … (${files.length} files)` : '')
  return [`changes outside the deck are not rendered from their commit: ${shown}; --install renders each commit with its own dependencies`]
}

async function comparePages(out: string, dir: string, threshold: number, parse: (name: string) => PageRef | undefined): Promise<VisualDiff[]> {
  const list = async (side: string) => (existsSync(join(out, side, dir)) ? readdir(join(out, side, dir)) : [])
  await mkdir(join(out, 'diff', dir), { recursive: true })
  const pages: VisualDiff[] = []
  for (const { page, a, b } of pairPages(await list('a'), await list('b'), parse)) {
    if (!a || !b) {
      pages.push({ ...page, status: pageStatus(1, threshold, !!a, !!b), ratio: 1, diffPixels: 0 })
      continue
    }
    const [imgA, imgB] = await Promise.all([readFile(join(out, 'a', dir, a)), readFile(join(out, 'b', dir, b))]).then(files => files.map(f => PNG.sync.read(f)))
    const { width, height } = imgA!
    if (width !== imgB!.width || height !== imgB!.height) {
      pages.push({ ...page, status: pageStatus(1, threshold, true, true), ratio: 1, diffPixels: width * height })
      continue
    }
    const diff = new PNG({ width, height })
    const diffPixels = pixelmatch(imgA!.data, imgB!.data, diff.data, width, height, { threshold: 0.1 })
    const ratio = diffPixels / (width * height)
    if (diffPixels > 0) await writeFile(join(out, 'diff', `${page.id}.png`), PNG.sync.write(diff))
    pages.push({ ...page, status: pageStatus(ratio, threshold, true, true), ratio, diffPixels })
  }
  return pages
}

function lockfileDir(deck: string, checkout: string): string {
  for (let d = deck; ; d = dirname(d)) {
    if (existsSync(join(d, 'pnpm-lock.yaml'))) return d
    if (d === checkout || dirname(d) === d) throw new Error('--install needs a pnpm-lock.yaml in the checked-out commit')
  }
}

async function removeWorktree(root: string, dir: string): Promise<void> {
  if (!existsSync(dir)) return
  await git(root, 'worktree', 'remove', '--force', dir).catch(() => undefined)
  await rm(dir, { recursive: true, force: true })
}
