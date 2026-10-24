import type { IRDocument, IRSection } from './ir.ts'

/** The canvas a document's slides are drawn on, before it is scaled to the screen: 980 wide and 16:9 unless the document's slides say otherwise. */
export interface SlideShape {
  width: number
  height: number
}

const WIDTH = 980

/** `aspectRatio` as the slides' configuration writes it: `16/9`, `4:3` or a number; 16:9 otherwise. */
function aspectOf(value: unknown): number {
  const [width, height] = typeof value === 'number' ? [value, 1] : typeof value === 'string' ? value.split(/[/:]/).map(Number) : []
  const aspect = height === undefined ? width : (width ?? Number.NaN) / height
  return aspect !== undefined && Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9
}

/** The canvas of the document's slides, from `renderers.slides` (`aspectRatio`, `canvasWidth`). */
export function slideShape(doc: Pick<IRDocument, 'config'>): SlideShape {
  const options = doc.config.renderers.slides ?? {}
  const width = typeof options.canvasWidth === 'number' && options.canvasWidth > 0 ? options.canvasWidth : WIDTH
  return { width, height: Math.round(width / aspectOf(options.aspectRatio)) }
}

/** The chapter each slide is in (the heading above it), which a slide shows above its title. */
export function slideChapters(doc: Pick<IRDocument, 'sections'>): Map<string, string> {
  const found = new Map<string, string>()
  let open: IRSection[] = []
  for (const section of doc.sections) {
    open = open.filter(outer => outer.depth < section.depth)
    const chapter = open.find(outer => outer.depth >= 1 && outer.title)
    if (chapter) found.set(section.id, chapter.title)
    open.push(section)
  }
  return found
}
