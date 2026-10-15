import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { DECK_ENTRY } from '@presmium/cli'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { diffReport, pageStatus, pairPages, reportMarkdown } from '../domain/index.ts'
import type { DiffSide, VisualDiff, VisualDiffReport } from '../domain/index.ts'
import { git, run } from './process.ts'

export interface DiffJob {
  refA: string
  refB: string
  deckDir: string
  /** Report directory; defaults to `<deckDir>/.presmium/diff`. */
  out?: string
  /** Share of differing pixels above which a page is listed (default 0: any difference). */
  threshold?: number
  /** Milliseconds `slidev export` waits before capturing each page, so layout and rendering settle (default 500). */
  wait?: number
  /**
   * Installs each commit's own dependencies from its lockfile (pnpm) instead of
   * rendering both commits with the deck's installed host and addons. Use it to
   * check a host upgrade; leave it off to review changes to the deck.
   */
  install?: boolean
}

/**
 * Exports every page (slide and click step) of the deck at two commits as PNG
 * with `slidev export`, compares them with pixelmatch and writes `report.json`,
 * `report.md` and the images under `a/`, `b/` and `diff/` of the report directory.
 *
 * Each commit is checked out as a git worktree inside the deck directory, so
 * the deck's dependencies resolve from it by the usual Node lookup. Warnings
 * name what the comparison leaves out.
 */
export async function visualDiff(job: DiffJob): Promise<{ report: VisualDiffReport, out: string, warnings: string[] }> {
  const deckDir = resolve(job.deckDir)
  const root = await git(deckDir, 'rev-parse', '--show-toplevel')
  const sides = await Promise.all([job.refA, job.refB].map(async (ref): Promise<DiffSide> => {
    const commit = await git(deckDir, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`).catch(() => '')
    if (!commit) throw new Error(`unknown revision "${ref}"`)
    return { ref, commit }
  }))
  const warnings = job.install ? [] : await unrendered(root, deckDir, sides[0]!.commit, sides[1]!.commit)

  const work = join(deckDir, '.presmium', 'diff')
  const out = resolve(job.out ?? work)
  // The report replaces a previous one; never clear a directory that holds something else.
  if (out !== work && existsSync(out) && (await readdir(out)).length > 0 && !existsSync(join(out, 'report.json'))) {
    throw new Error(`${out} is not empty and holds no previous report; choose another --out`)
  }
  await mkdir(work, { recursive: true })
  await writeFile(join(work, '.gitignore'), '*\n')
  for (const dir of ['a', 'b', 'diff']) await rm(join(out, dir), { recursive: true, force: true })

  for (const [label, side] of [['a', sides[0]!], ['b', sides[1]!]] as const) {
    const checkout = join(work, `checkout-${label}`)
    await removeWorktree(root, checkout)
    await git(root, 'worktree', 'add', '--detach', '--force', checkout, side.commit)
    try {
      const deck = join(checkout, relative(root, deckDir))
      if (!existsSync(join(deck, DECK_ENTRY))) throw new Error(`${side.ref} has no ${relative(root, join(deckDir, DECK_ENTRY))}`)
      if (job.install) await run(lockfileDir(deck, checkout), 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline'])
      // The variable reaches the page as import.meta.env (Vite exposes VITE_*); setup/root.ts then makes text rendering deterministic.
      await run(deck, 'slidev', ['export', DECK_ENTRY, '--format', 'png', '--with-clicks', '--wait', String(job.wait ?? 500), '--output', join(out, label)], { VITE_PRESMIUM_VISUAL_DIFF: '1' })
    } finally {
      await removeWorktree(root, checkout)
    }
  }

  const report = diffReport(sides[0]!, sides[1]!, job.threshold ?? 0, await comparePages(out, job.threshold ?? 0))
  await writeFile(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(join(out, 'report.md'), reportMarkdown(report))
  return { report, out, warnings }
}

/**
 * Without --install, both commits render with the dependencies installed for
 * the deck, e.g. the workspace's own addons in a monorepo: what the commits
 * change outside the deck directory does not show in the comparison.
 */
async function unrendered(root: string, deckDir: string, a: string, b: string): Promise<string[]> {
  const deck = relative(root, deckDir)
  if (!deck) return []
  const files = (await git(root, 'diff', '--name-only', a, b, '--', '.', `:(exclude)${deck}`)).split('\n').filter(Boolean)
  if (files.length === 0) return []
  const shown = files.slice(0, 3).join(', ') + (files.length > 3 ? `, … (${files.length} files)` : '')
  return [`changes outside the deck are not rendered from their commit: ${shown}; --install renders each commit with its own dependencies`]
}

async function comparePages(out: string, threshold: number): Promise<VisualDiff[]> {
  const list = async (side: string) => (existsSync(join(out, side)) ? readdir(join(out, side)) : [])
  await mkdir(join(out, 'diff'), { recursive: true })
  const pages: VisualDiff[] = []
  for (const { page, a, b } of pairPages(await list('a'), await list('b'))) {
    if (!a || !b) {
      pages.push({ ...page, status: pageStatus(1, threshold, !!a, !!b), ratio: 1, diffPixels: 0 })
      continue
    }
    const [imgA, imgB] = await Promise.all([readFile(join(out, 'a', a)), readFile(join(out, 'b', b))]).then(files => files.map(f => PNG.sync.read(f)))
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

/** Directory of the nearest `pnpm-lock.yaml` from the deck up to the checkout root. */
function lockfileDir(deck: string, checkout: string): string {
  for (let d = deck; ; d = dirname(d)) {
    if (existsSync(join(d, 'pnpm-lock.yaml'))) return d
    if (d === checkout || dirname(d) === d) throw new Error('--install needs a pnpm-lock.yaml in the checked-out commit')
  }
}

/** Removes a checkout; `worktree add --force` reuses the path even if git still lists it. */
async function removeWorktree(root: string, dir: string): Promise<void> {
  if (!existsSync(dir)) return
  await git(root, 'worktree', 'remove', '--force', dir).catch(() => undefined)
  await rm(dir, { recursive: true, force: true })
}
