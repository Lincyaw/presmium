// One PowerPoint deck (.pptx) to the Markdown tree a document is made from: each slide a page under its title, in
// slide order. Text boxes keep their paragraphs, emphasis and links; bulleted and numbered paragraphs become lists
// nested by level (bullets inherited from the layout and master count, as PowerPoint shows them); tables keep their
// merged cells; pictures become image blocks; the speaker notes become the page's narration. Positions, fonts,
// colours, animations and transitions do not enter the document; charts, SmartArt, embedded objects, media and
// pictures a browser cannot show become conversion notices on the page they were on.
import { posix } from 'node:path'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import type { MdastNode } from '@lincyaw/kernel'
import { toMarkdown } from 'mdast-util-to-markdown'
import { gfmToMarkdown } from 'mdast-util-gfm'
import { NARRATION_NODE } from './markdown.ts'
import type { ImportNotice } from './import-notices.ts'


const IMAGE_TYPES: Record<string, string> = { png: 'png', jpg: 'jpg', jpeg: 'jpg', gif: 'gif', webp: 'webp', svg: 'svg', bmp: 'bmp', avif: 'avif' }
const TITLE_LENGTH = 80
// The widest line a slide may hold alone and still be taken for its title, a CJK character (or full-width mark) 1 and
// any other character a half.
const SOLE_TITLE_WIDTH = 20
const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u2014\u3000-\u303f\uff00-\uffef]/u
const width = (text: string) => [...text].reduce((sum, char) => sum + (WIDE.test(char) ? 1 : 0.5), 0)
const SKIPPED_PLACEHOLDERS = new Set(['dt', 'ftr', 'sldNum', 'hdr', 'sldImg'])
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu
const LETTER = /\p{L}/gu

type Element = { nodeType: number, localName: string, namespaceURI: string | null, childNodes: ArrayLike<Element>, attributes: ArrayLike<{ localName: string, namespaceURI: string | null, value: string }>, getAttribute(name: string): string | null, textContent: string | null }

const children = (node: Element | undefined, name?: string): Element[] => {
  const out: Element[] = []
  if (!node) return out
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i]!
    if (child.nodeType === 1 && (!name || child.localName === name)) out.push(child)
  }
  return out
}
const child = (node: Element | undefined, ...path: string[]): Element | undefined => path.reduce<Element | undefined>((at, name) => children(at, name)[0], node)
const attr = (node: Element | undefined, name: string): string | undefined => node?.getAttribute(name) ?? undefined
/** A relationship ID attribute (`r:id`, `r:embed`), whatever prefix the file gives the relationships namespace. */
const relAttr = (node: Element | undefined, name: string): string | undefined => {
  if (!node) return undefined
  for (let i = 0; i < node.attributes.length; i++) {
    const item = node.attributes[i]!
    if (item.localName === name && item.namespaceURI?.endsWith('/relationships')) return item.value
  }
  return undefined
}

const signature = (node: MdastNode): string => node.type === 'text' ? 'text' : `${node.type}:${String(node.url ?? '')}>${node.children?.length === 1 ? signature(node.children[0]!) : '*'}`
const innermost = (node: MdastNode): MdastNode => node.children?.length === 1 ? innermost(node.children[0]!) : node
/** A picture's description as an author would write it: not a file name or path, nor the notice of an automatic one. */
const describe = (text: string | undefined): string | undefined => {
  const lines = (text ?? '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !/自动生成|automatically generated/i.test(line))
  const value = lines.join(' ')
  return value && !/[\\/]|\.(?:png|jpe?g|gif|webp|svg|bmp|avif|tiff?|emf|wmf)$/i.test(value) && !/^[\w-]*\d{4,}[\w-]*$/.test(value) && !/^(?:图片|图像|Picture|Image|Graphic)\s*\d*$/i.test(value) ? value : undefined
}
const plainText = (nodes: MdastNode[]): string => nodes.map(node => node.type === 'break' ? ' ' : typeof node.value === 'string' ? node.value : plainText(node.children ?? [])).join('')

interface Part { path: string, root: Element, rels: Map<string, { type: string, target: string, external: boolean }> }
interface Placeholder { type: string, idx?: string }
interface Item { y: number, x: number, order: number, nodes: MdastNode[], paragraphs?: Paragraph[] }
interface Paragraph { level: number, list?: { ordered: boolean, start?: number }, content: MdastNode[] }

export async function powerpointMarkdown(buffer: Uint8Array, name: string): Promise<{ text: string, assets: Map<string, Uint8Array>, notices: ImportNotice[], tree: MdastNode }> {
  const zip = await JSZip.loadAsync(buffer)
  const parts = new Map<string, Part | undefined>()
  const xml = async (path: string): Promise<Part | undefined> => {
    if (parts.has(path)) return parts.get(path)
    const file = zip.file(path)
    let part: Part | undefined
    if (file) {
      const root = new DOMParser({ errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} } }).parseFromString(await file.async('string'), 'application/xml').documentElement as unknown as Element | null
      const rels = new Map<string, { type: string, target: string, external: boolean }>()
      const relsFile = zip.file(posix.join(posix.dirname(path), '_rels', `${posix.basename(path)}.rels`))
      if (relsFile) {
        const relsRoot = new DOMParser({ errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} } }).parseFromString(await relsFile.async('string'), 'application/xml').documentElement as unknown as Element | null
        for (const rel of children(relsRoot ?? undefined, 'Relationship')) {
          const target = attr(rel, 'Target') ?? '', external = attr(rel, 'TargetMode') === 'External'
          rels.set(attr(rel, 'Id') ?? '', { type: (attr(rel, 'Type') ?? '').split('/').at(-1)!, external,
            target: external ? target : target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(posix.dirname(path), target)) })
        }
      }
      if (root) part = { path, root, rels }
    }
    parts.set(path, part)
    return part
  }
  const related = async (part: Part, type: string) => {
    const rel = [...part.rels.values()].find(item => item.type === type && !item.external)
    return rel ? xml(rel.target) : undefined
  }

  const presentation = await xml('ppt/presentation.xml')
  if (!presentation) throw new Error('not a PowerPoint presentation')
  const slidePaths = children(child(presentation.root, 'sldIdLst'), 'sldId').map(id => presentation.rels.get(relAttr(id, 'id') ?? '')?.target).filter((path): path is string => Boolean(path))

  const slideHeight = Number(attr(child(presentation.root, 'sldSz'), 'cy')) || 6858000
  const assets = new Map<string, Uint8Array>()
  const media = new Map<string, string>()
  const notices: ImportNotice[] = []
  const pages: { title?: string, notes: string, nodes: MdastNode[] }[] = []

  for (const path of slidePaths) {
    const slide = await xml(path)
    // An unreadable slide has no page of its own; its notice goes on the page before it.
    if (!slide) { notices.push({ page: Math.max(0, pages.length - 1), kind: 'slide' }); continue }
    const notice = (kind: ImportNotice['kind']) => notices.push({ page: pages.length, kind })
    const layout = await related(slide, 'slideLayout')
    const master = layout && await related(layout, 'slideMaster')

    const placeholderOf = (shape: Element): Placeholder | undefined => {
      const ph = child(shape, 'nvSpPr', 'nvPr', 'ph') ?? child(shape, 'nvPicPr', 'nvPr', 'ph') ?? child(shape, 'nvGraphicFramePr', 'nvPr', 'ph')
      return ph ? { type: attr(ph, 'type') ?? 'obj', idx: attr(ph, 'idx') } : undefined
    }
    const family = (type: string) => type === 'ctrTitle' ? 'title' : type === 'obj' ? 'body' : type
    /** The shape of `part` that a placeholder inherits from: the same index, else the same kind. */
    const inherited = (part: Part | undefined, ph: Placeholder) => {
      const shapes = part ? children(child(part.root, 'cSld', 'spTree'), 'sp') : []
      const withPh = shapes.map(shape => ({ shape, ph: placeholderOf(shape) })).filter(item => item.ph)
      return (ph.idx !== undefined ? withPh.find(item => item.ph!.idx === ph.idx) : undefined)?.shape
        ?? withPh.find(item => family(item.ph!.type) === family(ph.type))?.shape
    }
    const offsetOf = (node: Element | undefined) => {
      const off = child(node, 'spPr', 'xfrm', 'off') ?? child(node, 'xfrm', 'off') ?? child(node, 'grpSpPr', 'xfrm', 'off')
      return off ? { x: Number(attr(off, 'x') ?? 0), y: Number(attr(off, 'y') ?? 0) } : undefined
    }

    /** Whether a paragraph at `level` of the shape is bulleted or numbered: its own properties, then the list styles it inherits. */
    const bulletOf = (shape: Element, ph: Placeholder | undefined, pPr: Element | undefined, level: number): Paragraph['list'] => {
      const lvl = `lvl${level + 1}pPr`
      const masterStyle = ph ? (family(ph.type) === 'title' ? 'titleStyle' : 'bodyStyle') : 'otherStyle'
      const chain = [
        pPr,
        child(shape, 'txBody', 'lstStyle', lvl),
        ...ph ? [child(inherited(layout, ph), 'txBody', 'lstStyle', lvl), child(inherited(master, ph), 'txBody', 'lstStyle', lvl)] : [],
        child(master?.root, 'txStyles', masterStyle, lvl),
      ]
      for (const props of chain) {
        if (!props) continue
        if (child(props, 'buNone')) return undefined
        const number = child(props, 'buAutoNum')
        if (number) return { ordered: true, ...Number(attr(number, 'startAt')) > 1 ? { start: Number(attr(number, 'startAt')) } : {} }
        if (child(props, 'buChar') || child(props, 'buBlip')) return { ordered: false }
      }
      return undefined
    }

    const runs = (paragraph: Element, part: Part): MdastNode[] => {
      const out: MdastNode[] = []
      for (const run of children(paragraph)) {
        if (run.localName === 'br') { out.push({ type: 'break' }); continue }
        if (run.localName !== 'r' && run.localName !== 'fld') continue
        const text = (child(run, 't')?.textContent ?? '').replace(/\v/g, '\n')
        if (!text) continue
        const props = child(run, 'rPr')
        let node: MdastNode = { type: 'text', value: text }
        if (attr(props, 'strike') && attr(props, 'strike') !== 'noStrike') node = { type: 'delete', children: [node] }
        if (attr(props, 'i') === '1' || attr(props, 'i') === 'true') node = { type: 'emphasis', children: [node] }
        if (attr(props, 'b') === '1' || attr(props, 'b') === 'true') node = { type: 'strong', children: [node] }
        const link = part.rels.get(relAttr(child(props, 'hlinkClick'), 'id') ?? '')
        if (link?.external && /^(?:https?|mailto):/i.test(link.target)) node = { type: 'link', url: link.target, children: [node] }
        // PowerPoint splits text into runs for reasons that do not show (spelling, edits); equal formatting is one run.
        const last = out.at(-1)
        if (last && signature(last) === signature(node)) innermost(last).value = `${String(innermost(last).value)}${text}`
        else out.push(node)
      }
      // Leading and trailing spaces of a paragraph are layout.
      const first = out[0], end = out.at(-1)
      if (first?.type === 'text') first.value = String(first.value).trimStart()
      if (end?.type === 'text') end.value = String(end.value).trimEnd()
      return out.filter(node => !(node.type === 'text' && !node.value))
    }

    const paragraphsOf = (shape: Element, ph: Placeholder | undefined, part: Part): Paragraph[] =>
      children(child(shape, 'txBody'), 'p').map((p) => {
        const pPr = child(p, 'pPr')
        const level = Math.max(0, Math.min(8, Number(attr(pPr, 'lvl') ?? 0) || 0))
        const content = runs(p, part)
        return { level, content, ...content.length ? { list: bulletOf(shape, ph, pPr, level) } : {} }
      }).filter(paragraph => paragraph.content.length)

    /** Consecutive list paragraphs as one list, nested by level. */
    const blocksOf = (paragraphs: Paragraph[]): MdastNode[] => {
      const out: MdastNode[] = []
      let stack: { level: number, list: MdastNode }[] = []
      for (const paragraph of paragraphs) {
        if (!paragraph.list) { stack = []; out.push({ type: 'paragraph', children: paragraph.content }); continue }
        const item: MdastNode = { type: 'listItem', spread: false, children: [{ type: 'paragraph', children: paragraph.content }] }
        const newList = (): MdastNode => ({ type: 'list', ordered: paragraph.list!.ordered, ...paragraph.list!.start ? { start: paragraph.list!.start } : {}, spread: false, children: [] })
        if (!stack.length) { const list = newList(); out.push(list); stack = [{ level: paragraph.level, list }] }
        while (stack.length > 1 && paragraph.level < stack.at(-1)!.level) stack.pop()
        const top = stack.at(-1)!
        const parent = top.list.children?.at(-1)
        if (paragraph.level > top.level && parent) {
          const list = newList()
          parent.children!.push(list)
          stack.push({ level: paragraph.level, list })
        }
        stack.at(-1)!.list.children!.push(item)
      }
      return out
    }

    const tableOf = (table: Element, part: Part): MdastNode => {
      const rows = children(table, 'tr').map(row => ({ type: 'tableRow', children: children(row, 'tc')
        .filter(cell => attr(cell, 'hMerge') !== '1' && attr(cell, 'vMerge') !== '1')
        .map((cell) => {
          const content = children(child(cell, 'txBody'), 'p').map(p => runs(p, part)).filter(line => line.length)
          const colspan = Number(attr(cell, 'gridSpan') ?? 1), rowspan = Number(attr(cell, 'rowSpan') ?? 1)
          return { type: 'tableCell', children: content.flatMap((line, i) => i ? [{ type: 'break' }, ...line] : line),
            ...colspan > 1 ? { colspan } : {}, ...rowspan > 1 ? { rowspan } : {} }
        }) }))
      const firstRow = attr(child(table, 'tblPr'), 'firstRow')
      return { type: 'table', headerRows: firstRow === '1' || firstRow === 'true' ? 1 : 0, children: rows }
    }

    const imageOf = (picture: Element, part: Part): MdastNode | undefined => {
      const rel = part.rels.get(relAttr(child(picture, 'blipFill', 'blip'), 'embed') ?? '')
      const extension = rel && !rel.external ? IMAGE_TYPES[posix.extname(rel.target).slice(1).toLowerCase()] : undefined
      const file = rel && zip.file(rel.target)
      if (!rel || !extension || !file) { notice('image'); return undefined }
      let name = media.get(rel.target)
      if (!name) { name = `slide-image-${media.size + 1}.${extension}`; media.set(rel.target, name) }
      const description = child(picture, 'nvPicPr', 'cNvPr')
      return { type: 'paragraph', children: [{ type: 'image', url: name, alt: describe(attr(description, 'descr')) ?? describe(attr(description, 'title')) ?? '' }], file }
    }

    let title: string | undefined
    let order = 0
    /** The shapes of a tree in reading order (top to bottom, then left to right), each with what it contributes. */
    const collect = async (tree: Element | undefined): Promise<Item[]> => {
      const items: Item[] = []
      for (let shape of children(tree)) {
        if (shape.localName === 'AlternateContent') shape = child(shape, 'Choice') ? children(child(shape, 'Choice'))[0] ?? shape : children(child(shape, 'Fallback'))[0] ?? shape
        const ph = placeholderOf(shape)
        if (ph && SKIPPED_PLACEHOLDERS.has(ph.type)) continue
        const at = offsetOf(shape) ?? (ph ? offsetOf(inherited(layout, ph)) ?? offsetOf(inherited(master, ph)) : undefined) ?? { x: 0, y: 0 }
        let nodes: MdastNode[] = []
        if (shape.localName === 'sp') {
          const paragraphs = paragraphsOf(shape, ph, slide)
          if (ph && family(ph.type) === 'title' && title === undefined) { title = paragraphs.map(p => plainText(p.content)).join(' ').trim() || undefined; if (title) continue }
          if (paragraphs.length) items.push({ ...at, order: order++, nodes: blocksOf(paragraphs), paragraphs })
          continue
        } else if (shape.localName === 'pic') {
          // A video or a sound shows its poster picture; the media itself does not come along.
          if (children(child(shape, 'nvPicPr', 'nvPr')).some(item => /^(?:videoFile|audioFile|quickTimeFile|wavAudioFile)$/.test(item.localName))) { notice('media'); continue }
          const image = imageOf(shape, slide)
          if (image) nodes = [image]
        } else if (shape.localName === 'graphicFrame') {
          const table = child(shape, 'graphic', 'graphicData', 'tbl')
          const uri = attr(child(shape, 'graphic', 'graphicData'), 'uri') ?? ''
          if (table) nodes = [tableOf(table, slide)]
          else notice(uri.endsWith('/chart') ? 'chart' : uri.endsWith('/diagram') ? 'diagram' : 'object')
        } else if (shape.localName === 'grpSp') {
          // A group is read as one shape where it stands, its own shapes in their order.
          items.push(...(await collect(shape)).map(item => ({ ...item, ...at, order: order++ })))
        }
        if (nodes.length) items.push({ ...at, order: order++, nodes })
      }
      return items.sort((a, b) => a.y - b.y || a.x - b.x || a.order - b.order)
    }
    const items = await collect(child(slide.root, 'cSld', 'spTree'))
    // A slide without a title placeholder is titled by its first line of text when that reads as one: not a list item,
    // not a sentence, and either a short line near the top with more of the slide below it, or a very short line that is
    // the slide's only content (a section divider). Other text, a lone sentence in a free text box say, stays the body.
    const texts = items.filter(item => item.paragraphs)
    const lead = texts[0], first = lead?.paragraphs![0]
    const line = first ? plainText(first.content).trim() : ''
    const sole = items.length === 1 && lead?.paragraphs!.length === 1
    if (title === undefined && lead && first && !first.list && !/[。！？；：.!?;:]$/.test(line)
      && (sole ? width(line) <= SOLE_TITLE_WIDTH : line.length <= TITLE_LENGTH && lead.y < slideHeight * 0.3)) {
      title = plainText(first.content).trim()
      lead.nodes = blocksOf(lead.paragraphs!.slice(1))
    }
    const nodes = items.flatMap(item => item.nodes)
    // Image bytes are read once the slide's order is settled.
    for (const node of nodes) {
      const file = (node as { file?: JSZip.JSZipObject }).file
      if (!file) continue
      delete (node as { file?: unknown }).file
      const url = String(node.children![0]!.url)
      if (!assets.has(url)) assets.set(url, await file.async('uint8array'))
    }

    const notesPart = await related(slide, 'notesSlide')
    const notes = notesPart
      ? children(child(notesPart.root, 'cSld', 'spTree'), 'sp').filter(shape => placeholderOf(shape)?.type === 'body')
        .flatMap(shape => children(child(shape, 'txBody'), 'p').map(p => plainText(runs(p, notesPart)).trim()).filter(Boolean)).join('\n')
      : ''
    pages.push({ title, notes, nodes })
  }

  const all = pages.map(page => `${page.title ?? ''}${plainText(page.nodes)}`).join('')
  const letters = all.match(LETTER)?.length ?? 0
  const chinese = letters > 0 && (all.match(CJK)?.length ?? 0) / letters > 0.3
  const body: MdastNode[] = []
  pages.forEach((page, i) => {
    // An untitled first slide gives the deck's file name to the document; later ones are numbered.
    const heading = page.title ?? (i === 0 ? name : chinese ? `幻灯片 ${i + 1}` : `Slide ${i + 1}`)
    body.push({ type: 'heading', depth: 1, children: [{ type: 'text', value: heading }] })
    if (page.notes) body.push({ type: NARRATION_NODE, value: page.notes })
    body.push(...page.nodes)
  })
  const tree: MdastNode = { type: 'root', children: body }
  const text = toMarkdown({ type: 'root', children: body.filter(node => node.type !== NARRATION_NODE) } as never, { extensions: [gfmToMarkdown()], bullet: '-', fences: true })
  return { text, tree, assets, notices }
}
