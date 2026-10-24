import { mkdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { blockText, sectionNarration } from '@lincyaw/kernel'
import type { ExportContext, Exporter, IRDocument, PresmiumNodePlugin } from '@lincyaw/kernel'
import { playwrightChromium } from '@lincyaw/kernel/node'
import { printSlides, slidesRenderer } from '@lincyaw/web/slides'
import type { PrintingChromium, PrintOptions } from '@lincyaw/web/slides'
import PptxGenJS from 'pptxgenjs'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

// PowerPoint measures a slide in inches, at 96 pixels each.
const PIXELS_PER_INCH = 96
const PICTURES = '.pictures'

/** Whether the document has the slides form: its configuration names it, or names no renderer. */
function hasSlides(doc: IRDocument): boolean {
  const named = Object.keys(doc.config.renderers)
  return named.length === 0 || named.includes('slides')
}

/**
 * What the one who asked chose (`presmium-export`'s flags): `steps`, a page for every step; `slides`, the slides by number
 * from 1; `dark`; `timeout`, how long the page may take, in milliseconds.
 */
function printChoices(options: Record<string, unknown>): Pick<PrintOptions, 'steps' | 'slides' | 'dark' | 'timeout'> {
  const slides = Array.isArray(options.slides) ? options.slides.filter((n): n is number => Number.isInteger(n) && n > 0) : undefined
  return {
    steps: options.steps === true,
    ...slides ? { slides } : {},
    ...options.dark === true ? { dark: true } : {},
    ...typeof options.timeout === 'number' && options.timeout > 0 ? { timeout: options.timeout } : {},
  }
}

/** Builds the slides and prints them. */
async function printed(ctx: ExportContext, format: 'pdf' | 'png', output: string) {
  ctx.progress('build')
  const dir = await ctx.build('slides')
  ctx.progress('print')
  const chromium = await playwrightChromium<PrintingChromium>(ctx.deckDir, import.meta.url)
  const result = await printSlides({ dir, chromium, format, output, signal: ctx.signal, ...printChoices(ctx.options) })
  return { ...result, doc: JSON.parse(await readFile(join(dir, 'ir.json'), 'utf8')) as IRDocument }
}

function slidesExporter(id: string, label: Record<string, string>, run: Exporter['run']): Exporter {
  return { id, label, available: hasSlides, run }
}

const plugin: PresmiumNodePlugin = {
  id: 'presmium.slides',
  version,
  kernel: '^1.0.0',
  renderer: slidesRenderer,
  exporters: [
    slidesExporter('pdf', { 'zh-CN': '幻灯片 PDF', 'en': 'Slides as PDF' }, async (ctx) => {
      await printed(ctx, 'pdf', join(ctx.outDir, 'slides.pdf'))
      return { files: ['slides.pdf'] }
    }),
    slidesExporter('png', { 'zh-CN': '幻灯片图片', 'en': 'Slides as pictures' }, async (ctx) => {
      const { pages } = await printed(ctx, 'png', ctx.outDir)
      return { files: pages.map(page => page.file!) }
    }),
    // A picture of each slide, its narration as the speaker notes.
    slidesExporter('pptx', { 'zh-CN': '幻灯片 PowerPoint', 'en': 'Slides as PowerPoint' }, async (ctx) => {
      const pictures = join(ctx.outDir, PICTURES)
      await mkdir(pictures, { recursive: true })
      try {
        const { shape, pages, doc } = await printed(ctx, 'png', pictures)
        ctx.progress('pptx')
        const pptx = new PptxGenJS()
        const [w, h] = [shape.width / PIXELS_PER_INCH, shape.height / PIXELS_PER_INCH]
        pptx.defineLayout({ name: 'PRESMIUM', width: w, height: h })
        pptx.layout = 'PRESMIUM'
        pptx.title = doc.meta.title
        const sections = new Map(doc.sections.map(section => [section.id, section]))
        for (const page of pages) {
          const slide = pptx.addSlide()
          slide.addImage({ path: join(pictures, page.file!), x: 0, y: 0, w, h })
          const section = sections.get(page.section)
          const notes = section ? sectionNarration(section).map(blockText).join('\n\n') : ''
          if (notes) slide.addNotes(notes)
        }
        await pptx.writeFile({ fileName: join(ctx.outDir, 'slides.pptx') })
        return { files: ['slides.pptx'] }
      } finally {
        await rm(pictures, { recursive: true, force: true })
      }
    }),
  ],
}

export default plugin
