/**
 * The figures of the printed slides as SVG files. A figure is an `<svg data-figure="name">` a component draws: on the
 * print page every slide is laid out at each of its steps, so the figure's markup at a step is its picture at that step.
 * The markup is taken with the look the page's styles give it written on each element (the files have no stylesheet),
 * its pictures inlined, and the same figure at consecutive steps kept once.
 */

/** A figure as one printed page shows it. */
export interface PrintedFigure {
  /** The index of the printed page (`.pm-slides-print__page`). */
  page: number
  name: string
  svg: string
}

/** A figure's file: `<name>-<n>.svg`, n counting its distinct pictures from 1 (`<name>.svg` when it has one). */
export interface FigureFile {
  file: string
  svg: string
  page: number
}

const NAME = /[^\p{L}\p{N}._-]+/gu

/** Names each distinct picture of each figure; a name on more than one slide is taken as is, its pictures in order. */
export function figureFiles(figures: PrintedFigure[]): FigureFile[] {
  const byName = new Map<string, PrintedFigure[]>()
  for (const figure of figures) {
    const name = figure.name.replace(NAME, '-').replace(/^-+|-+$/g, '') || 'figure'
    const kept = byName.get(name) ?? []
    if (kept.at(-1)?.svg !== figure.svg) kept.push(figure)
    byName.set(name, kept)
  }
  return [...byName].flatMap(([name, kept]) => kept.map((figure, i) => ({
    file: kept.length === 1 ? `${name}.svg` : `${name}-${i + 1}.svg`,
    svg: figure.svg,
    page: figure.page,
  })))
}

/**
 * Runs in the print page (`page.evaluate`): the figures of every printed page, in order. Self-contained, as Playwright
 * sends its source to the page.
 */
export async function readFigures(selector: { page: string, figure: string }): Promise<PrintedFigure[]> {
  const SVG = 'http://www.w3.org/2000/svg'
  // The properties that make an SVG element's look. An inherited one is written where it differs from the parent's (on
  // the root, from an unstyled element's), any other where it differs from an unstyled element's.
  const INHERITED = [
    'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'visibility', 'clip-rule', 'marker-start', 'marker-mid',
    'marker-end', 'paint-order', 'shape-rendering', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
    'font-stretch', 'letter-spacing', 'word-spacing', 'text-anchor', 'dominant-baseline', 'white-space', 'writing-mode',
  ]
  const OWN = [
    'opacity', 'stop-color', 'stop-opacity', 'flood-color', 'flood-opacity', 'lighting-color', 'clip-path', 'mask', 'filter',
    'vector-effect', 'mix-blend-mode', 'alignment-baseline', 'baseline-shift', 'text-decoration-line', 'transform',
  ]
  const PROPERTIES = [...INHERITED, ...OWN, 'transform-origin', 'transform-box']
  const probeHost = document.createElementNS(SVG, 'svg')
  probeHost.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;all:initial')
  document.body.append(probeHost)
  const defaults = new Map<string, Map<string, string>>()
  const defaultsOf = (tag: string) => {
    let known = defaults.get(tag)
    if (!known) {
      const probe = document.createElementNS(SVG, tag)
      probeHost.append(probe)
      const style = getComputedStyle(probe)
      known = new Map(PROPERTIES.map(property => [property, style.getPropertyValue(property)]))
      probe.remove()
      defaults.set(tag, known)
    }
    return known
  }
  const inline = async (href: string) => {
    if (href.startsWith('data:') || href.startsWith('#')) return href
    try {
      const blob = await (await fetch(new URL(href, document.baseURI))).blob()
      return await new Promise<string>((done) => {
        const reader = new FileReader()
        reader.onload = () => done(String(reader.result))
        reader.onerror = () => done(href)
        reader.readAsDataURL(blob)
      })
    } catch { return href }
  }
  const copy = async (source: Element, target: Element, parent: CSSStyleDeclaration | undefined) => {
    const style = getComputedStyle(source)
    if (style.display === 'none') {
      target.remove()
      return
    }
    const known = defaultsOf(source.localName)
    const written: string[] = []
    for (const property of INHERITED) {
      const value = style.getPropertyValue(property)
      if (value && value !== (parent ? parent.getPropertyValue(property) : known.get(property))) written.push(`${property}:${value}`)
    }
    for (const property of OWN) {
      const value = style.getPropertyValue(property)
      // The root's place on the page is not the figure's.
      if (!parent && property === 'transform') continue
      if (value && value !== known.get(property)) written.push(`${property}:${value}`)
    }
    if (parent && style.transform !== 'none') {
      for (const property of ['transform-origin', 'transform-box']) {
        const value = style.getPropertyValue(property)
        if (value !== known.get(property)) written.push(`${property}:${value}`)
      }
    }
    target.removeAttribute('class')
    if (written.length > 0) target.setAttribute('style', written.join(';'))
    else target.removeAttribute('style')
    if (source.localName === 'image') {
      const href = source.getAttribute('href') ?? source.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      if (href) target.setAttribute('href', await inline(href))
    }
    const children = [...source.children], copies = [...target.children]
    for (const [i, child] of children.entries()) await copy(child, copies[i]!, style)
  }
  try {
    const pages = [...document.querySelectorAll<HTMLElement>(selector.page)]
    const figures: PrintedFigure[] = []
    for (const [page, element] of pages.entries()) {
      // A figure inside another one belongs to it.
      const found = [...element.querySelectorAll<SVGSVGElement>(selector.figure)].filter(svg => !svg.parentElement?.closest(selector.figure))
      for (const svg of found) {
        const box = svg.getBoundingClientRect()
        // The size in the slide's own pixels, before any scaling of the slide.
        const slide = svg.closest<HTMLElement>('.pm-slide')
        const scale = slide && slide.offsetWidth > 0 ? slide.getBoundingClientRect().width / slide.offsetWidth : 1
        const [width, height] = [box.width / (scale || 1), box.height / (scale || 1)]
        const clone = svg.cloneNode(true) as SVGSVGElement
        await copy(svg, clone, undefined)
        clone.setAttribute('xmlns', SVG)
        if (!clone.hasAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${Math.round(width)} ${Math.round(height)}`)
        clone.setAttribute('width', String(Math.round(width)))
        clone.setAttribute('height', String(Math.round(height)))
        const name = svg.getAttribute('data-figure') ?? ''
        clone.removeAttribute('data-figure')
        figures.push({ page, name, svg: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n` })
      }
    }
    return figures
  } finally {
    probeHost.remove()
  }
}
