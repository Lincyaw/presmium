import { existsSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Compiler, DECK_ENTRY, prepare, viewFor } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import { exportedSlides, missingSlides, parseRange } from '../domain/index.ts'
import { run } from './process.ts'

/** Entry of the Slidev deck that the slides renderer writes to its work directory (docs/ir.md section 6). */
export const SLIDEV_ENTRY = 'slides.md'

/** The name of a page Slidev exports as PNG: `001.png`, `002-01.png` with clicks. */
const PAGE_IMAGE = /^\d+(?:-\d+)?\.png$/

/** Milliseconds the print page settles, once loaded, before `slidev export` captures it (`--wait`), unless a job says otherwise. */
export const EXPORT_WAIT = 1000

/** Milliseconds the print page may take to load (`--timeout`): Slidev's default, 30 s, is short for a busy machine. */
export const EXPORT_TIMEOUT = 120_000

export interface SlidesDeck {
  compilation: Compilation
  /** Directory of the Slidev deck generated from the IR. */
  dir: string
  /** Compile and render findings, as text. */
  warnings: string[]
}

/** Whether `dir` holds a deck the compiler reads. */
export function isDeck(dir: string): boolean {
  return existsSync(join(dir, DECK_ENTRY))
}

/** Whether the deck has the form of renderer `id`: it configures that renderer, or none (then every installed renderer runs). */
export function hasForm(compilation: Compilation, id: string): boolean {
  const { renderers } = compilation.doc.config
  return Object.keys(renderers).length === 0 || id in renderers
}

/**
 * Has the slides renderer write the Slidev deck of a compilation to its work
 * directory, without building it (`prepare`): `slidev export` serves the deck
 * itself, at the root whatever base the slides are built for, so the deck is
 * written for the root: the files it links and its components show are found
 * there. It is written as an export shows it (`renderers.slides.liveCode:
 * false`): code that runs live is static code with its recorded output,
 * which the page shows once, whatever its runtime does. Throws when the
 * renderer is missing or fails.
 */
export async function slidevDeck(compilation: Compilation): Promise<SlidesDeck> {
  const { renderers } = compilation.doc.config
  const exported = { ...compilation, doc: { ...compilation.doc, config: { ...compilation.doc.config, renderers: { ...renderers, slides: { ...renderers.slides, liveCode: false } } } } }
  // Nothing is written to the output directory.
  const report = await prepare(exported, { outDir: join(compilation.deckDir, 'dist'), to: ['slides'], base: '/' })
  const warnings = report.findings.filter(f => f.severity !== 'info').map(f => f.message)
  const slides = report.outputs.find(o => o.renderer === 'slides')
  if (!slides) {
    throw new Error(report.findings.filter(f => f.checkId === 'presmium.render').map(f => f.message).join('; ') || 'the slides renderer did not run')
  }
  return { compilation, dir: slides.workDir, warnings }
}

/** Compiles the deck and writes its Slidev deck (`slidevDeck`). */
export async function slidesDeck(deckDir: string): Promise<SlidesDeck> {
  return slidevDeck(await new Compiler(deckDir).compile())
}

/** A run of `slidev export` on the Slidev deck of a compilation (`slidevDeck`). */
export interface SlidevExport {
  format: 'pdf' | 'png'
  /** The PDF file, or the directory of the PNG images. */
  output: string
  withClicks?: boolean
  /** Slidev range such as `1,4-6`. */
  range?: string
  dark?: boolean
  /** `--wait`, default `EXPORT_WAIT`. */
  wait?: number
  /** `--timeout`, default `EXPORT_TIMEOUT`. */
  timeout?: number
  /** Added to the environment of `slidev export`. */
  env?: Record<string, string>
}

/** How many slides `slidev export` exports of the deck at most: the slides shown, not hidden or disabled. */
export function shownSlides(compilation: Compilation): number {
  return viewFor(compilation.doc, 'slides').sections.filter(section => !section.hints.slides?.hide && !section.hints.slides?.disabled).length
}

/**
 * The failure of an export that lacks slides (`what` it wrote). `slidev
 * export` captures the print page once it has loaded and settled for `wait`
 * ms, whatever it shows by then: a page that has not shown every slide yet,
 * on a busy machine or when Vite reloads it on a deck's first export (it
 * optimizes the dependencies it finds while serving the deck), is captured
 * as it is.
 */
export function incompleteExport(what: string, wait: number): Error {
  return new Error(`slidev export ${what}: it captured the print page before the page showed every slide (a busy machine, or a deck's first export, when Vite optimizes its dependencies and reloads the page); export again, or let the page settle longer than ${wait} ms with --wait <ms>`)
}

/** The PNG images of an export in `dir`. */
async function images(dir: string): Promise<string[]> {
  return existsSync(dir) ? (await readdir(dir)).filter(file => PAGE_IMAGE.test(file)) : []
}

/**
 * Runs `slidev export` on a Slidev deck: the print page loads until the
 * network is idle (`--wait-until networkidle`, the safest of Slidev's states)
 * within `timeout`, then settles for `wait` before it is captured. The PNG
 * images are checked: when a slide of the export has none, the export fails
 * (`incompleteExport`) rather than pass for the slides. Resolves with the
 * images (none for a PDF).
 */
export async function slidevExport(deck: SlidesDeck, job: SlidevExport): Promise<string[]> {
  const wait = job.wait ?? EXPORT_WAIT
  const args = ['export', SLIDEV_ENTRY, '--format', job.format, '--output', job.output, '--wait-until', 'networkidle', '--wait', String(wait), '--timeout', String(job.timeout ?? EXPORT_TIMEOUT)]
  if (job.withClicks) args.push('--with-clicks')
  if (job.range) args.push('--range', job.range)
  if (job.dark) args.push('--dark')
  // The images of an earlier export would stay beside the new ones.
  if (job.format === 'png') await Promise.all((await images(job.output)).map(file => rm(join(job.output, file))))
  await run(deck.dir, 'slidev', args, job.env)
  if (job.format === 'pdf') return []

  // Slidev exports the images of the slides of the range only.
  const slides = exportedSlides(shownSlides(deck.compilation), parseRange(job.range))
  const written = await images(job.output)
  const missing = missingSlides(written, slides)
  if (missing.length > 0) throw incompleteExport(`wrote ${written.length} images, none of slide ${missing.join(', ')} of the ${slides.length} slides exported`, wait)
  return written
}
