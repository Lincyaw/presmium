/**
 * What each printed slide shows, read from its laid-out page so that an editable file (PowerPoint) can draw it again:
 * text as paragraphs of styled runs, tables as rows of cells, pictures, coloured boxes, and whatever has no such form
 * (a formula, a figure, a component) as a region to take a picture of. Places and sizes are in the canvas's pixels,
 * from the slide's top left corner, as the slide is laid out (shrunk to fit, when it is).
 */

export interface SlideRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  /** `#rrggbb` */
  color?: string
  /** In pixels of the canvas. */
  size: number
  font?: string
  link?: string
  /** A line break before the run, within its paragraph. */
  breakBefore?: boolean
}

export interface SlideParagraph {
  runs: SlideRun[]
  align?: 'left' | 'center' | 'right' | 'justify'
  bullet?: 'bullet' | 'number'
  /** The number of a numbered list's first item. */
  start?: number
  /** From 0, the list's depth. */
  level?: number
  /** In pixels of the canvas. */
  lineHeight?: number
  spaceBefore?: number
}

interface Placed {
  x: number
  y: number
  w: number
  h: number
}

export type SlideItem = Placed & (
  | { kind: 'box', fill?: string, line?: { color: string, width: number } }
  /** `padding`: top, right, bottom and left, in pixels of the canvas. */
  | { kind: 'text', paragraphs: SlideParagraph[], padding?: [number, number, number, number] }
  | { kind: 'table', rows: { h: number, cells: { paragraphs: SlideParagraph[], colspan: number, rowspan: number, fill?: string, header: boolean }[] }[], columns: number[], line?: { color: string, width: number }, padding?: [number, number, number, number] }
  | { kind: 'image', data: string }
  /** A region to take a picture of: the element marked with `data-pm-layout-picture` set to `picture`. */
  | { kind: 'picture', picture: number }
)

export interface SlideLayout {
  /** The index of the printed page (`.pm-slides-print__page`). */
  page: number
  background?: string
  items: SlideItem[]
}

/** The attribute that marks the regions to take a picture of, its value the region's number. */
export const PICTURE_ATTRIBUTE = 'data-pm-layout-picture'

/**
 * Runs in the print page (`page.evaluate`): the layout of every printed page, in order. Self-contained, as Playwright
 * sends its source to the page.
 */
export async function readSlideLayouts(selector: { page: string, attribute: string }): Promise<SlideLayout[]> {
  // What is drawn as a picture: no text or table form says what it shows.
  const PICTURES = 'svg, canvas, video, iframe, object, embed, math, .katex, .katex-display, mjx-container, .pm-component-missing'
  // The viewer's own marks on a slide (the document's title, the step dots, the page number): PowerPoint numbers its
  // slides itself, and a deck edited there would carry stale copies of them.
  const CHROME = '.pm-slide__footer'
  const INLINE = new Set(['inline', 'inline-block', 'inline-flex', 'inline-grid', 'contents'])
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const paint = canvas.getContext('2d', { willReadFrequently: true })!
  /** Any CSS colour as `#rrggbb`, or undefined when it is (nearly) transparent. */
  const hex = (value: string): string | undefined => {
    if (!value || value === 'transparent') return undefined
    paint.clearRect(0, 0, 1, 1)
    paint.fillStyle = '#000'
    paint.fillStyle = value
    paint.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data
    if (a! < 32) return undefined
    return `#${[r, g, b].map(n => n!.toString(16).padStart(2, '0')).join('')}`
  }
  const shown = (element: Element) => {
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
    // A closed disclosure shows its summary only.
    const closed = element.closest('details:not([open])')
    if (closed && closed !== element && !element.closest('summary')) return false
    const rect = element.getBoundingClientRect()
    return rect.width > 0.5 && rect.height > 0.5
  }
  const isBlock = (element: Element) => !INLINE.has(getComputedStyle(element).display) && element.localName !== 'br'
  /** A small picture in a line of text (a link's icon): left out, as the text is drawn again around it. */
  const icon = (element: Element) => element.localName === 'svg' && !isBlock(element)
    && element.getBoundingClientRect().height <= parseFloat(getComputedStyle(element.parentElement ?? element).fontSize) * 1.5
  const family = (value: string) => value.split(',')[0]!.trim().replace(/^["']|["']$/g, '')
  const asData = async (src: string) => {
    try {
      const blob = await (await fetch(src)).blob()
      if (!/^image\/(png|jpeg|gif)$/.test(blob.type)) return undefined
      return await new Promise<string | undefined>((done) => {
        const reader = new FileReader()
        reader.onload = () => done(String(reader.result))
        reader.onerror = () => done(undefined)
        reader.readAsDataURL(blob)
      })
    } catch { return undefined }
  }

  const layouts: SlideLayout[] = []
  let pictures = 0
  for (const [page, element] of [...document.querySelectorAll<HTMLElement>(selector.page)].entries()) {
    const slide = element.querySelector<HTMLElement>('.pm-slide') ?? element
    const origin = slide.getBoundingClientRect()
    const background = hex(getComputedStyle(slide).backgroundColor)
    const items: SlideItem[] = []
    const place = (target: Element): Placed => {
      const rect = target.getBoundingClientRect()
      const x = Math.max(0, rect.left - origin.left), y = Math.max(0, rect.top - origin.top)
      return { x, y, w: Math.min(rect.right - origin.left, origin.width) - x, h: Math.min(rect.bottom - origin.top, origin.height) - y }
    }
    const visible = (target: Element) => {
      const rect = target.getBoundingClientRect()
      return rect.right > origin.left && rect.left < origin.right && rect.bottom > origin.top && rect.top < origin.bottom
    }
    /** How much the element is shrunk on the page (the slide's fit), for its computed sizes. */
    const scaleOf = (target: Element) => {
      const html = target as HTMLElement
      return html.offsetWidth > 0 ? target.getBoundingClientRect().width / html.offsetWidth : 1
    }
    // Pictures inside a list or a table, drawn over it once it is placed.
    let over: Element[] = []
    const flush = () => {
      for (const target of over) picture(target)
      over = []
    }
    const picture = (target: Element) => {
      if (!visible(target)) return
      target.setAttribute(selector.attribute, String(pictures))
      items.push({ ...place(target), kind: 'picture', picture: pictures++ })
    }
    const box = (target: Element) => {
      if (target === slide) return
      const style = getComputedStyle(target)
      const fill = hex(style.backgroundColor)
      const width = parseFloat(style.borderTopWidth)
      const uniform = width >= 1 && ['Right', 'Bottom', 'Left'].every(side => style.getPropertyValue(`border-${side.toLowerCase()}-width`) === style.borderTopWidth)
      const line = uniform ? hex(style.borderTopColor) : undefined
      const scale = scaleOf(target)
      if ((fill && fill !== background) || line) items.push({ ...place(target), kind: 'box', ...fill && fill !== background ? { fill } : {}, ...line ? { line: { color: line, width: width * scale } } : {} })
      // A bar on one side only (a quotation, a callout).
      const left = parseFloat(style.borderLeftWidth)
      const bar = !uniform && left >= 1 ? hex(style.borderLeftColor) : undefined
      if (bar) {
        const at = place(target)
        items.push({ ...at, w: left * scale, kind: 'box', fill: bar })
      }
    }
    /** The inline content of `target` as runs, leaving out its blocks (`skip`: a list item's own lists). */
    const runsOf = (target: Element, skip: (child: Element) => boolean): SlideRun[] => {
      const runs: SlideRun[] = []
      let breakNext = false
      const pre = /^pre/.test(getComputedStyle(target).whiteSpace)
      const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const parent = node.parentElement!
          const style = getComputedStyle(parent)
          let text = node.textContent ?? ''
          if (!/^pre/.test(style.whiteSpace)) text = text.replace(/\s+/g, ' ')
          if (!text) return
          if (/^pre/.test(style.whiteSpace) && text.includes('\n')) {
            const lines = text.split('\n')
            lines.forEach((line, i) => {
              if (i > 0) breakNext = true
              if (line || i === lines.length - 1) push(parent, style, line)
            })
            return
          }
          push(parent, style, text)
          return
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return
        const child = node as Element
        if (child.localName === 'br') { breakNext = true; return }
        if (skip(child) || !shown(child) || icon(child)) return
        if (child.matches(PICTURES) || child.localName === 'img') { over.push(child); return }
        for (const inner of child.childNodes) walk(inner)
      }
      const push = (parent: Element, style: CSSStyleDeclaration, text: string) => {
        const link = parent.closest('a')?.href
        const decoration = style.textDecorationLine
        runs.push({
          text,
          size: parseFloat(style.fontSize) * scaleOf(parent),
          ...parseInt(style.fontWeight) >= 600 ? { bold: true } : {},
          ...style.fontStyle === 'italic' ? { italic: true } : {},
          ...decoration.includes('underline') && !link ? { underline: true } : {},
          ...decoration.includes('line-through') ? { strike: true } : {},
          ...hex(style.color) ? { color: hex(style.color) } : {},
          font: family(style.fontFamily),
          ...link && /^https?:|^mailto:/.test(link) ? { link } : {},
          ...breakNext ? { breakBefore: true } : {},
        })
        breakNext = false
      }
      for (const node of target.childNodes) walk(node)
      // Collapsed white space at the ends of a paragraph is not drawn.
      if (!pre && runs.length) {
        runs[0]!.text = runs[0]!.text.replace(/^ /, '')
        runs[runs.length - 1]!.text = runs[runs.length - 1]!.text.replace(/ $/, '')
      }
      return runs.filter(run => run.text || run.breakBefore)
    }
    const paragraphOf = (target: Element, runs: SlideRun[], extra: Partial<SlideParagraph> = {}): SlideParagraph => {
      const style = getComputedStyle(target)
      const scale = scaleOf(target)
      const align = style.textAlign === 'center' || style.textAlign === 'right' || style.textAlign === 'justify' ? style.textAlign : style.textAlign === 'end' ? 'right' : 'left'
      const line = parseFloat(style.lineHeight)
      return { runs, align, ...Number.isFinite(line) ? { lineHeight: line * scale } : {}, ...extra }
    }
    const inSvg = (inner: Element) => inner.localName !== 'svg' && inner.closest('svg') !== null
    /** Whether the element is drawn as text: inline content only, nothing that needs a picture. */
    const textLeaf = (target: Element) => ![...target.querySelectorAll('*')].some(inner => shown(inner) && !inSvg(inner) && !icon(inner) && (isBlock(inner) || inner.matches(PICTURES) || inner.localName === 'img'))
    const list = (target: Element) => {
      const paragraphs: SlideParagraph[] = []
      const walkList = (listElement: Element, level: number) => {
        const start = listElement.localName === 'ol' ? (listElement as HTMLOListElement).start : undefined
        for (const item of listElement.children) {
          if (item.localName !== 'li' || !shown(item)) continue
          const nested = (child: Element) => child.localName === 'ul' || child.localName === 'ol'
          const runs = runsOf(item, nested)
          // A list drawn without markers (a task list) has none in PowerPoint either.
          const marker = getComputedStyle(item).listStyleType
          const bullet = marker === 'none' ? undefined : /decimal|roman|alpha|latin|cjk|chinese|numeric/.test(marker) ? 'number' as const : 'bullet' as const
          if (runs.length) paragraphs.push(paragraphOf(item, runs, { ...bullet ? { bullet } : {}, ...bullet === 'number' && start !== undefined ? { start } : {}, level, spaceBefore: paragraphs.length ? parseFloat(getComputedStyle(item).marginTop) * scaleOf(item) : 0 }))
          for (const child of item.querySelectorAll(':scope > ul, :scope > ol, :scope > * > ul, :scope > * > ol')) walkList(child, level + 1)
        }
      }
      walkList(target, 0)
      if (paragraphs.length) items.push({ ...place(target), kind: 'text', paragraphs })
      flush()
    }
    const table = (target: HTMLTableElement) => {
      const rows = [...target.rows].filter(shown)
      if (!rows.length) return
      const widest = rows.reduce((best, row) => row.cells.length > best.cells.length ? row : best, rows[0]!)
      const columns = [...widest.cells].map(cell => cell.getBoundingClientRect().width)
      const sample = target.querySelector('td, th')
      const style = sample && getComputedStyle(sample)
      const width = style ? parseFloat(style.borderBottomWidth) : 0
      const color = style && width >= 1 ? hex(style.borderBottomColor) : undefined
      items.push({
        ...place(target),
        kind: 'table',
        columns,
        ...color ? { line: { color, width: width * scaleOf(target) } } : {},
        ...style ? { padding: (['Top', 'Right', 'Bottom', 'Left'] as const).map(side => parseFloat(style.getPropertyValue(`padding-${side.toLowerCase()}`)) * scaleOf(target)) as [number, number, number, number] } : {},
        rows: rows.map(row => ({
          h: row.getBoundingClientRect().height,
          cells: [...row.cells].map((cell) => {
            const fill = hex(getComputedStyle(cell).backgroundColor) ?? hex(getComputedStyle(row).backgroundColor)
            return { paragraphs: [paragraphOf(cell, runsOf(cell, () => false))], colspan: cell.colSpan, rowspan: cell.rowSpan, header: cell.localName === 'th', ...fill && fill !== background ? { fill } : {} }
          }),
        })),
      })
      flush()
    }
    const visit = async (target: Element) => {
      if (!shown(target) || target.matches(CHROME)) return
      if (target.matches(PICTURES)) return picture(target)
      if (target.localName === 'img') {
        const image = target as HTMLImageElement
        const rect = image.getBoundingClientRect()
        // Drawn as it is when the whole picture fills its box; cropped or fitted ones are taken as shown.
        const whole = image.naturalWidth > 0 && Math.abs(image.naturalWidth / image.naturalHeight - rect.width / rect.height) < 0.02
        const data = whole && visible(image) && rect.bottom <= origin.bottom + 1 ? await asData(image.currentSrc || image.src) : undefined
        if (data) items.push({ ...place(image), kind: 'image', data })
        else picture(image)
        return
      }
      box(target)
      if (target.localName === 'table') return table(target as HTMLTableElement)
      if (target.localName === 'ul' || target.localName === 'ol') return list(target)
      if (target !== slide && textLeaf(target)) {
        const runs = runsOf(target, () => false)
        const style = getComputedStyle(target)
        const scale = scaleOf(target)
        const padding = (['top', 'right', 'bottom', 'left'] as const).map(side => parseFloat(style.getPropertyValue(`padding-${side}`)) * scale + parseFloat(style.getPropertyValue(`border-${side}-width`)) * scale) as [number, number, number, number]
        if (runs.some(run => run.text.trim())) items.push({ ...place(target), kind: 'text', paragraphs: [paragraphOf(target, runs)], ...padding.some(side => side > 0.5) ? { padding } : {} })
        return
      }
      // A paragraph with a formula or a picture in its line is taken whole.
      if (!isBlock(target) || ![...target.children].some(isBlock)) {
        if (target !== slide && (target.textContent ?? '').trim()) return picture(target)
      }
      for (const child of target.children) await visit(child)
    }
    await visit(slide)
    layouts.push({ page, ...background ? { background } : {}, items: items.filter(item => item.w > 0.5 && item.h > 0.5) })
  }
  return layouts
}
