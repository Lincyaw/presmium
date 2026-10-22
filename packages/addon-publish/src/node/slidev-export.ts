import { existsSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { prepare, viewFor } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'
import { TYPESCRIPT_IMPORT } from '@lincyaw/kernel/node'
import { exportedSlides, missingSlides, parseRange } from '../domain/index.ts'
import { run } from './process.ts'

export const SLIDEV_ENTRY = 'slides.md'

const PAGE_IMAGE = /^\d+(?:-\d+)?\.png$/

export const EXPORT_WAIT = 1000

export const EXPORT_TIMEOUT = 120_000

/** The Slidev project the slides renderer writes for a compiled deck, where `slidev export` runs. */
export interface SlidevProject {
  compilation: Compilation
  dir: string
  warnings: string[]
}

export async function prepareSlidevProject(compilation: Compilation): Promise<SlidevProject> {
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

export interface SlidevExportOptions {
  format: 'pdf' | 'png'
  output: string
  withClicks?: boolean
  range?: string
  dark?: boolean
  wait?: number
  timeout?: number
  env?: Record<string, string>
}

export function shownSlideCount(compilation: Compilation): number {
  return viewFor(compilation.doc, 'slides').sections.filter(section => !section.hints.slides?.hide && !section.hints.slides?.disabled).length
}

export function incompleteExport(what: string, wait: number): Error {
  return new Error(`slidev export ${what}: it captured the print page before the page showed every slide (a busy machine, or a deck's first export, when Vite optimizes its dependencies and reloads the page); export again, or let the page settle longer than ${wait} ms with --wait <ms>`)
}

async function images(dir: string): Promise<string[]> {
  return existsSync(dir) ? (await readdir(dir)).filter(file => PAGE_IMAGE.test(file)) : []
}

export async function runSlidevExport(project: SlidevProject, job: SlidevExportOptions): Promise<string[]> {
  const wait = job.wait ?? EXPORT_WAIT
  const args = ['export', SLIDEV_ENTRY, '--format', job.format, '--output', job.output, '--wait-until', 'networkidle', '--wait', String(wait), '--timeout', String(job.timeout ?? EXPORT_TIMEOUT)]
  if (job.withClicks) args.push('--with-clicks')
  if (job.range) args.push('--range', job.range)
  if (job.dark) args.push('--dark')
  if (job.format === 'png') await Promise.all((await images(job.output)).map(file => rm(join(job.output, file))))
  const nodeOptions = [job.env?.NODE_OPTIONS ?? process.env.NODE_OPTIONS, ...TYPESCRIPT_IMPORT].filter(Boolean).join(' ')
  await run(project.dir, 'slidev', args, { ...job.env, NODE_OPTIONS: nodeOptions })
  if (job.format === 'pdf') return []

  const slides = exportedSlides(shownSlideCount(project.compilation), parseRange(job.range))
  const written = await images(job.output)
  const missing = missingSlides(written, slides)
  if (missing.length > 0) throw incompleteExport(`wrote ${written.length} images, none of slide ${missing.join(', ')} of the ${slides.length} slides exported`, wait)
  return written
}
