import { existsSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Compiler, DECK_ENTRY, prepare, viewFor } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import { TYPESCRIPT_IMPORT } from '@presmium/kernel/node'
import { exportedSlides, missingSlides, parseRange } from '../domain/index.ts'
import { run } from './process.ts'

export const SLIDEV_ENTRY = 'slides.md'

const PAGE_IMAGE = /^\d+(?:-\d+)?\.png$/

export const EXPORT_WAIT = 1000

export const EXPORT_TIMEOUT = 120_000

export interface SlidesDeck {
  compilation: Compilation
  dir: string
  warnings: string[]
}

export function isDeck(dir: string): boolean {
  return existsSync(join(dir, DECK_ENTRY))
}

export function hasForm(compilation: Compilation, id: string): boolean {
  const { renderers } = compilation.doc.config
  return Object.keys(renderers).length === 0 || id in renderers
}

export async function slidevDeck(compilation: Compilation): Promise<SlidesDeck> {
  const { renderers } = compilation.doc.config
  const exported = { ...compilation, doc: { ...compilation.doc, config: { ...compilation.doc.config, renderers: { ...renderers, slides: { ...renderers.slides, liveCode: false } } } } }
  const report = await prepare(exported, { outDir: join(compilation.deckDir, 'dist'), to: ['slides'], base: '/' })
  const warnings = report.findings.filter(f => f.severity !== 'info').map(f => f.message)
  const slides = report.outputs.find(o => o.renderer === 'slides')
  if (!slides) {
    throw new Error(report.findings.filter(f => f.checkId === 'presmium.render').map(f => f.message).join('; ') || 'the slides renderer did not run')
  }
  return { compilation, dir: slides.workDir, warnings }
}

export async function slidesDeck(deckDir: string): Promise<SlidesDeck> {
  return slidevDeck(await new Compiler(deckDir).compile())
}

export interface SlidevExport {
  format: 'pdf' | 'png'
  output: string
  withClicks?: boolean
  range?: string
  dark?: boolean
  wait?: number
  timeout?: number
  env?: Record<string, string>
}

export function shownSlides(compilation: Compilation): number {
  return viewFor(compilation.doc, 'slides').sections.filter(section => !section.hints.slides?.hide && !section.hints.slides?.disabled).length
}

export function incompleteExport(what: string, wait: number): Error {
  return new Error(`slidev export ${what}: it captured the print page before the page showed every slide (a busy machine, or a deck's first export, when Vite optimizes its dependencies and reloads the page); export again, or let the page settle longer than ${wait} ms with --wait <ms>`)
}

async function images(dir: string): Promise<string[]> {
  return existsSync(dir) ? (await readdir(dir)).filter(file => PAGE_IMAGE.test(file)) : []
}

export async function slidevExport(deck: SlidesDeck, job: SlidevExport): Promise<string[]> {
  const wait = job.wait ?? EXPORT_WAIT
  const args = ['export', SLIDEV_ENTRY, '--format', job.format, '--output', job.output, '--wait-until', 'networkidle', '--wait', String(wait), '--timeout', String(job.timeout ?? EXPORT_TIMEOUT)]
  if (job.withClicks) args.push('--with-clicks')
  if (job.range) args.push('--range', job.range)
  if (job.dark) args.push('--dark')
  if (job.format === 'png') await Promise.all((await images(job.output)).map(file => rm(join(job.output, file))))
  const nodeOptions = [job.env?.NODE_OPTIONS ?? process.env.NODE_OPTIONS, ...TYPESCRIPT_IMPORT].filter(Boolean).join(' ')
  await run(deck.dir, 'slidev', args, { ...job.env, NODE_OPTIONS: nodeOptions })
  if (job.format === 'pdf') return []

  const slides = exportedSlides(shownSlides(deck.compilation), parseRange(job.range))
  const written = await images(job.output)
  const missing = missingSlides(written, slides)
  if (missing.length > 0) throw incompleteExport(`wrote ${written.length} images, none of slide ${missing.join(', ')} of the ${slides.length} slides exported`, wait)
  return written
}
