import { join } from 'node:path'
import type { SlideShape } from '@lincyaw/kernel'
import type { SlideLayout, SlideParagraph } from '@lincyaw/web/slides'
import PptxGenJS from 'pptxgenjs'

// PowerPoint measures a slide in inches, at 96 pixels each, and text in points, at 72 an inch.
const PIXELS_PER_INCH = 96
const POINTS_PER_PIXEL = 72 / PIXELS_PER_INCH
// PowerPoint's fonts are not the browser's: a box (a table's column) is a little wider than the line it holds, so that
// the line does not wrap.
const TEXT_SLACK = 1.04
const COLUMN_SLACK = 1.15

type Slide = ReturnType<PptxGenJS['addSlide']>
type TextRun = Exclude<Parameters<Slide['addText']>[0], string>[number]
type TableRow = Parameters<Slide['addTable']>[0][number]

const inches = (px: number) => px / PIXELS_PER_INCH
const points = (px: number) => Math.round(px * POINTS_PER_PIXEL * 10) / 10
const color = (hex: string | undefined) => hex?.replace('#', '').toUpperCase()

/** The paragraphs as PowerPoint's text runs: a paragraph ends with `breakLine`, and each of its runs carries its settings. */
function textRuns(paragraphs: SlideParagraph[]): TextRun[] {
  return paragraphs.flatMap((paragraph, i) => {
    const first = paragraph.runs[0]?.size ?? 16
    const settings = {
      align: paragraph.align,
      ...paragraph.lineHeight ? { lineSpacing: points(paragraph.lineHeight) } : {},
      ...paragraph.spaceBefore ? { paraSpaceBefore: points(paragraph.spaceBefore) } : {},
      ...paragraph.bullet ? { bullet: { ...paragraph.bullet === 'number' ? { type: 'number' as const, ...paragraph.start !== undefined ? { numberStartAt: paragraph.start } : {} } : {}, indent: points(first * 1.3) }, indentLevel: paragraph.level ?? 0 } : {},
    }
    const runs = paragraph.runs.length ? paragraph.runs : [{ text: '', size: first }]
    return runs.map((run, j) => ({
      text: run.text,
      options: {
        ...settings,
        fontSize: points(run.size),
        ...run.font ? { fontFace: run.font } : {},
        ...run.bold ? { bold: true } : {},
        ...run.italic ? { italic: true } : {},
        ...run.underline ? { underline: { style: 'sng' as const } } : {},
        ...run.strike ? { strike: 'sngStrike' as const } : {},
        ...run.color ? { color: color(run.color) } : {},
        ...run.link ? { hyperlink: { url: run.link } } : {},
        ...run.breakBefore ? { softBreakBefore: true } : {},
        ...j === runs.length - 1 && i < paragraphs.length - 1 ? { breakLine: true } : {},
      },
    }))
  })
}

/**
 * Draws each page's layout on a slide of `pptx`: text boxes, tables, pictures and boxes where the slide view has them,
 * the regions without such a form as their pictures (`<n>.png` in `pictures`), and `notes` as the speaker notes.
 */
export function drawSlides(pptx: PptxGenJS, shape: SlideShape, layouts: SlideLayout[], pictures: string, notes: (page: number) => string): void {
  for (const layout of layouts) {
    const slide = pptx.addSlide()
    if (layout.background) slide.background = { color: color(layout.background)! }
    for (const item of layout.items) {
      const at = { x: inches(item.x), y: inches(item.y), w: inches(item.w), h: inches(item.h) }
      if (item.kind === 'box') {
        slide.addShape(pptx.ShapeType.rect, { ...at, fill: item.fill ? { color: color(item.fill)! } : { type: 'none' }, line: item.line ? { color: color(item.line.color)!, width: points(item.line.width) } : { type: 'none' } })
      } else if (item.kind === 'image') {
        slide.addImage({ ...at, data: item.data })
      } else if (item.kind === 'picture') {
        slide.addImage({ ...at, path: join(pictures, `${item.picture}.png`) })
      } else if (item.kind === 'text') {
        const inner = item.h - (item.padding ? item.padding[0] + item.padding[2] : 0)
        const single = item.paragraphs.length === 1 && inner < (item.paragraphs[0]!.lineHeight ?? inner) * 1.6
        const align = item.paragraphs[0]?.align
        const room = Math.min(item.w * (TEXT_SLACK - 1), shape.width - item.x - item.w)
        const x = align === 'center' ? item.x - Math.min(room / 2, item.x) : align === 'right' ? item.x - Math.min(room, item.x) : item.x
        // pptxgenjs takes a text box's margins as left, right, bottom, top, in points.
        const [top, right, bottom, left] = (item.padding ?? [0, 0, 0, 0]).map(points) as [number, number, number, number]
        const margin: [number, number, number, number] = [left, right, bottom, top]
        slide.addText(textRuns(item.paragraphs), { ...at, x: inches(x), w: inches(item.w + room), margin, valign: 'top', fit: 'none', wrap: !single })
      } else {
        const rows: TableRow[] = item.rows.map(row => row.cells.map(cell => ({
          text: textRuns(cell.paragraphs),
          options: {
            ...cell.colspan > 1 ? { colspan: cell.colspan } : {},
            ...cell.rowspan > 1 ? { rowspan: cell.rowspan } : {},
            ...cell.fill ? { fill: { color: color(cell.fill)! } } : {},
            ...cell.header ? { bold: true } : {},
            ...item.padding ? { margin: item.padding.map(inches) as [number, number, number, number] } : {},
            valign: 'middle' as const,
          },
        })))
        const widen = Math.min(COLUMN_SLACK, (shape.width - item.x) / Math.max(1, item.columns.reduce((sum, w) => sum + w, 0)))
        slide.addTable(rows, {
          ...at,
          colW: item.columns.map(w => inches(w * Math.max(1, widen))),
          rowH: item.rows.map(row => inches(row.h)),
          border: item.line ? { type: 'solid', color: color(item.line.color)!, pt: points(item.line.width) } : { type: 'none' },
        })
      }
    }
    const text = notes(layout.page)
    if (text) slide.addNotes(text)
  }
}
