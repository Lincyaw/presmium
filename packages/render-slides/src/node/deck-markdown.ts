import { componentProps, deckLocale, docBlocks, errorMessage, escapeHtml, isProseRun, nodeMdast, withPublishedAssets } from '@lincyaw/kernel'
import type { CodeNode, ComponentNode, IRBlock, IRDocument, IRSection, LocalAsset, Locale, MdastNode, RenderContext } from '@lincyaw/kernel'
import { originBar } from '@lincyaw/viewer/domain'
import type { OriginPart } from '@lincyaw/viewer/domain'
import { stringify } from 'yaml'
import { fence, fenceLength, lineRanges } from './code-fences.ts'
import { deckLang, headmatter } from './deck-headmatter.ts'
import { monacoRun, runsLive } from './deck-live-code.ts'
import { runOutput } from './deck-outputs.ts'
import type { Generation } from './generation.ts'
import { publishAsset, slideMarkdown } from './mdast-to-slides.ts'
import { SLIDES_MESSAGES } from './messages.ts'

export interface SlidevDeck {
  markdown: string
  assets: Map<string, LocalAsset>
}

/** The IR as the Markdown of a Slidev deck, with the local files it publishes. */
export function slidevMarkdown(doc: IRDocument, ctx: RenderContext, dir: string): SlidevDeck {
  const locale = deckLocale(ctx.lang ?? deckLang(doc))
  const generation: Generation = { ctx, dir, locale, t: SLIDES_MESSAGES[locale], assets: new Map(), files: new Set(), links: slideLinks(doc), section: '', live: ctx.config.liveCode !== false, chapters: chapters(doc), liveRunKeys: new WeakMap() }
  const markdown = doc.sections.map((section, i) => slide(section, i === 0 ? headmatter(doc, generation) : {}, generation)).join('\n')
  return { markdown, assets: generation.assets }
}

const REFERENCES = new Set(['crossReference', 'footnoteReference', 'footnoteDefinition', 'linkReference', 'imageReference', 'definition', 'cite'])

function slideLinks(doc: IRDocument): (label: string) => string | undefined {
  const slides = new Map<string, number>()
  const add = (label: unknown, slide: number) => {
    if (typeof label === 'string' && label && !slides.has(label.toLowerCase())) slides.set(label.toLowerCase(), slide)
  }
  const visit = (node: MdastNode, slide: number) => {
    if (!REFERENCES.has(node.type)) {
      add(node.identifier, slide)
      add(node.label, slide)
    }
    node.children?.forEach(child => visit(child, slide))
  }
  for (const section of doc.sections) add(section.id, section.index)
  for (const { section, block } of docBlocks(doc)) {
    add(block.id, section.index)
    for (const tree of nodeMdast(block.node)) visit(tree, section.index)
  }
  return (label) => {
    const slide = slides.get(label.toLowerCase())
    return slide === undefined ? undefined : `/${slide}`
  }
}

function chapters(doc: IRDocument): Map<string, string> {
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

function slide(section: IRSection, head: Record<string, unknown>, gen: Generation): string {
  gen.section = section.id
  const config = section.config ? { [section.index === 1 ? 'presmiumSection' : 'presmium']: gen.ctx.portable(section.config, gen.dir) } : {}
  const chapter = gen.chapters.get(section.id)
  const frontmatter = { ...head, ...section.hints.slides, ...config, ...chapter ? { presmiumChapter: chapter } : {} }
  const notes: IRBlock[] = []
  const parts = section.title ? [slideMarkdown({ type: 'heading', depth: 1, children: [{ type: 'text', value: section.title }] }, undefined, gen)] : []
  parts.push(...blocks(section.blocks, gen, notes, false))
  const body = [`<div class="pm-slide-section" data-section="${escapeHtml(section.id)}">\n\n${parts.join('\n\n')}\n\n</div>`]
  if (notes.length > 0) body.push(`<!--\n${notesText(notes, gen)}\n-->`)
  const open = Object.keys(frontmatter).length > 0 ? `---\n${stringify(frontmatter).trim()}\n---` : '---'
  return `${open}\n\n${body.join('\n\n')}\n`
}

function blocks(list: IRBlock[], gen: Generation, notes: IRBlock[], owned: boolean, inComponent = owned): string[] {
  const out: string[] = []
  for (const block of list) {
    if (block.role === 'narration') notes.push(block)
    else out.push(visual(block, gen, notes, owned, inComponent))
  }
  return out
}

function visual(block: IRBlock, gen: Generation, notes: IRBlock[], owned: boolean, inComponent: boolean): string {
  const { node } = block
  const key = inComponent ? ` key="${escapeHtml(block.id)}"` : ''
  const wrap = (content: string) => (inComponent || unanchored(block) ? content : `<div class="pm-block" data-block="${escapeHtml(block.id)}" data-section="${escapeHtml(gen.section)}" data-step="${block.at}">\n\n${content}\n\n</div>`)
  if (node.type === 'markdown' && node.reveal === 'items') {
    return wrap(`<v-clicks at="${block.at === 0 ? '+0' : block.at}"${key}>\n\n${slideMarkdown(node.mdast, block, gen)}\n\n</v-clicks>`)
  }
  const content = node.type === 'markdown' ? slideMarkdown(node.mdast, block, gen)
    : node.type === 'code' ? code(node, block, gen, owned)
    : scoped(component(node, block, gen, notes), block.at, block.until)
  if (block.at === 0 && block.until === undefined) return wrap(content)
  const click = block.until === undefined ? `v-click="${block.at}"`
    : block.at === 0 ? `v-click.hide="${block.until}"`
    : `v-click="[${block.at}, ${block.until}]"`
  return wrap(`<div ${click}${block.until === undefined ? '' : ' class="pm-step-range"'}${key}>\n\n${content}\n\n</div>`)
}

const NOT_CONTENT = new Set(['html', 'footnoteDefinition', 'definition'])

function unanchored(block: IRBlock): boolean {
  const { node } = block
  if (node.type !== 'markdown') return false
  const children = node.mdast.type === 'root' ? node.mdast.children ?? [] : [node.mdast]
  return children.length > 0 && children.every(child => NOT_CONTENT.has(child.type))
}

function scoped(content: string, at: number, until?: number): string {
  return at > 0 || until !== undefined
    ? `<PmStepScope :at="${at}"${until === undefined ? '' : ` :until="${until}"`}>\n\n${content}\n\n</PmStepScope>`
    : content
}

function link(className: string, href: string | undefined, text: string, attrs = ''): string {
  return href
    ? `<a class="${className}" href="${escapeHtml(href)}" target="_blank" rel="noopener"${attrs}>${escapeHtml(text)}</a>`
    : `<span class="${className}"${attrs}>${escapeHtml(text)}</span>`
}

function originPart(part: OriginPart, attrs = ''): string {
  const own = [
    part.title ? ` title="${escapeHtml(part.title)}"` : '',
    part.status ? ` data-status="${part.status}"` : '',
    part.drift ? ` data-drift="${part.drift}"` : '',
  ].join('')
  return link(`pm-code-origin__${part.kind}`, part.href, part.text, `${own}${attrs}`)
}

function originBarHtml(node: CodeNode, at: number, locale: Locale): string {
  const bar = node.origin && originBar(node, undefined, locale)
  if (!bar) return ''
  const variants = node.variants ?? []
  const shown = `Math.min(Math.max($clicks - ${at}, 0), ${variants.length - 1})`
  const parts = bar.parts.flatMap((part) => {
    if (part.kind === 'file' && variants.length) {
      return variants.map((_, k) => originPart(originBar(node, k, locale)!.parts[0]!, ` v-show="${shown} === ${k}"`))
    }
    if (part.kind === 'variant') {
      const k = bar.parts.filter(p => p.kind === 'variant').indexOf(part)
      return [originPart(part, ` :data-active="${shown} === ${k} ? '' : undefined"`)]
    }
    return [originPart(part)]
  })
  return `<div class="pm-code-origin"${bar.anchor ? ` data-anchor="${escapeHtml(bar.anchor)}"` : ''}>\n${parts.join('\n')}\n</div>`
}

function code(node: CodeNode, block: IRBlock, gen: Generation, owned: boolean): string {
  const at = block.at
  const stages = (sets: number[][]) => `{${sets.map(lineRanges).join('|')}}${sets.length > 1 ? `{at:${at + 1}}` : ''}`
  const title = (label?: string) => label ? ` [${label}]` : ''
  let out: string
  if (node.echo === false) {
    const runs = node.outputs ?? []
    const prose = runs.length > 0 && runs.every(run => isProseRun(run))
    return runs.map(run => runOutput(run, block, gen, prose)).filter(Boolean).join('\n\n')
  } else if (!owned && runsLive(node, gen)) {
    return [originBarHtml(node, at, gen.locale), monacoRun(node, block, gen)].filter(Boolean).join('\n\n')
  } else if (node.variants?.length) {
    const steps = node.variants.map((variant, k) => {
      const lines = node.highlight?.[k]
      return fence(node.lang, variant.value, `${title(variant.label)}${lines ? ` ${stages([lines])}` : ''}`)
    })
    out = `${'`'.repeat(fenceLength(steps.join('\n')))}md magic-move {at:${at + 1}}\n${steps.join('\n')}\n${'`'.repeat(fenceLength(steps.join('\n')))}`
  } else {
    out = fence(node.lang, node.value, `${title(node.title)}${node.highlight?.length ? ` ${stages(node.highlight)}` : ''}`)
  }
  const outputs = owned ? [] : (node.outputs ?? []).map(run => runOutput(run, block, gen))
  return [originBarHtml(node, at, gen.locale), out, ...outputs].filter(Boolean).join('\n\n')
}

function empty(fallback: MdastNode | undefined): boolean {
  return !fallback || (fallback.type === 'root' && !fallback.children?.length)
}

function component(original: ComponentNode, block: IRBlock, gen: Generation, notes: IRBlock[]): string {
  const node = withPublishedAssets(original, url => publishAsset(url, block, gen, 'prop'))
  const extension = gen.ctx.extensionFor(node)
  if (!extension && !node.plugin) return node.fallback ? slideMarkdown(node.fallback, block, gen) : `> ${gen.t.webOnly(node.name)}`
  let live: string | undefined
  if (extension) {
    try {
      const output = extension(node, block)
      if (output !== undefined && output !== null) live = String(output)
    } catch (error) {
      gen.ctx.report({
        checkId: 'presmium.slides',
        severity: 'warning',
        message: `the slides extension of ${node.name} (plugin ${node.plugin || 'unknown'}) failed: ${errorMessage(error)}; the slide shows the component without it`,
        source: { file: block.source.file, line: block.source.line },
      })
    }
  }
  live ??= tag(node, gen, notes)
  const content = empty(node.fallback) && (node.layer === 'overlay' || !node.fallback)
    ? live
    : `<PmStaticFallback>\n\n${live}\n\n<template v-slot:fallback>\n\n${slideMarkdown(unfolded(node.fallback!), block, gen)}\n\n</template>\n</PmStaticFallback>`
  return `<PmBoundary name="${escapeHtml(node.name)}">\n\n${content}\n\n</PmBoundary>`
}

function unfolded(node: MdastNode): MdastNode {
  if (node.type === 'html' && typeof node.value === 'string') return { ...node, value: node.value.replace(/<details(?=[^>]*\sdata-static="open")/g, '<details open') }
  return node.children ? { ...node, children: node.children.map(unfolded) } : node
}

function tag(node: ComponentNode, gen: Generation, notes: IRBlock[]): string {
  const attrs = Object.entries(componentProps(node)).map(([name, value]) => typeof value === 'string' && !node.assets?.[name]
    ? ` ${name}="${escapeHtml(value).replace(/\n/g, '&#10;')}"`
    : ` :${name}='${JSON.stringify(value).replace(/'/g, '\\u0027').replace(/&/g, '\\u0026')}'`).join('')
  const children = node.children ? blocks(node.children, gen, notes, node.ownsCode !== false, true) : []
  return children.length > 0 ? `<${node.name}${attrs}>\n\n${children.join('\n\n')}\n\n</${node.name}>` : `<${node.name}${attrs} />`
}

function notesText(notes: IRBlock[], gen: Generation): string {
  let step = 0
  return [...notes].sort((a, b) => a.at - b.at).map((block) => {
    const { node } = block
    let text = node.type === 'markdown' ? slideMarkdown(node.mdast, block, gen, true)
      : node.type === 'code' ? fence(node.lang, node.value, '')
      : node.fallback ? slideMarkdown(node.fallback, block, gen, true) : ''
    if (block.at > step) {
      const marker = block.at - step === 1 ? '[click]' : `[click:${block.at - step}]`
      text = node.type === 'markdown' && node.mdast.children?.[0]?.type === 'paragraph' ? `${marker} ${text}` : `${marker}\n\n${text}`
      step = block.at
    }
    return text
  }).join('\n\n').replace(/-->/g, '--&gt;')
}
