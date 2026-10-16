/**
 * IR to the Markdown of a Slidev deck (docs/ir.md section 6): one slide per
 * section, the section title as its heading and `hints.slides` and the
 * section's `{config}` as its frontmatter; the deck's language in `htmlAttrs`.
 * Visual blocks appear at their step through absolute `v-click`
 * positions; a component block gets its `at` as step scope (`<PmStepScope>`
 * of @presmium/host), from which the component counts its internal steps.
 * Narration becomes the slide notes, split by `[click]` markers. MyST is
 * lowered to standard Markdown (`lowerMyst`); local files that blocks name
 * are published with the slides, at the root of the site, and links to them
 * open the file in a tab of its own.
 */
import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { DEFAULT_LANG, deckLocale, docBlocks, errorMessage, lowerMyst, nodeMdast } from '@presmium/kernel'
import type { CodeNode, ComponentNode, IRBlock, IRDocument, IRSection, LinkedType, Locale, MdastNode, RenderContext } from '@presmium/kernel'
import { stringify } from 'yaml'
import { codeLang, escapeHtml, markdown } from './markdown.ts'

/** What the generated deck says itself, in the deck's language. */
const MESSAGES = {
  'zh-CN': {
    status: { moved: '已移动', fuzzy: '待确认', lost: '已失效' } as Record<string, string>,
    workingTree: '工作区',
    drifted: '已漂移',
    pinned: '已锁定',
    openInRepository: (file: string) => `在仓库中打开 ${file}`,
    webOnly: (name: string) => `组件 ${name} 只能在网页中查看。`,
  },
  'en': {
    status: { moved: 'moved', fuzzy: 'to confirm', lost: 'lost' } as Record<string, string>,
    workingTree: 'working tree',
    drifted: 'drifted',
    pinned: 'pinned',
    openInRepository: (file: string) => `Open ${file} in the repository`,
    webOnly: (name: string) => `The component ${name} can only be viewed on the web.`,
  },
} satisfies Record<Locale, unknown>

type Messages = (typeof MESSAGES)[Locale]

/** The generated deck: its Markdown and the local files it publishes, by published name. */
export interface SlidevDeck {
  markdown: string
  /** Published name (`<hash>-<name>`, at the root of the site) -> absolute path of the file. */
  assets: Map<string, string>
}

/** One generation of the deck. */
interface Generation {
  ctx: RenderContext
  /** Directory of the generated deck; relative paths are written against it. */
  dir: string
  t: Messages
  assets: Map<string, string>
  /** URLs of the published files that links point to. */
  files: Set<string>
  /** The slide route of a label in the deck, for links to it. */
  links: (label: string) => string | undefined
}

/**
 * A favicon of the deck's own. Slidev's default is a remote image that its
 * build downloads under the generated deck and refers to by a path from the
 * file system root, so the slides would depend on where the deck is checked out.
 */
const FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#0ea5e9"/></svg>')}`

/** The deck's language: its `lang`, else the default; both forms put it in `<html lang>`. */
export function deckLang(doc: IRDocument): string {
  return typeof doc.meta.lang === 'string' && doc.meta.lang ? doc.meta.lang : DEFAULT_LANG
}

/** Keys of `renderers.slides` that configure the renderer rather than the Slidev headmatter. */
const RENDERER_KEYS = new Set(['package', 'base', 'port'])

/** Package of the web renderer, unless `renderers.web.package` names another. */
const WEB_PACKAGE = '@presmium/web'

/** `dir` is the directory of the generated deck. */
export function slidevMarkdown(doc: IRDocument, ctx: RenderContext, dir: string): SlidevDeck {
  const generation: Generation = { ctx, dir, t: MESSAGES[deckLocale(ctx.lang ?? deckLang(doc))], assets: new Map(), files: new Set(), links: slideLinks(doc) }
  const markdown = doc.sections.map((section, i) => slide(section, i === 0 ? headmatter(doc, generation) : {}, generation)).join('\n')
  return { markdown, assets: generation.assets }
}

/** Whether a plugin renders the component for this renderer (a `rendererExtensions.slides` entry), as `RenderContext.extensionFor` decides. */
export function hasExtension(node: ComponentNode, extensions: RenderContext['extensions']): boolean {
  return extensions.some(e => (!node.plugin || e.plugin === node.plugin) && e.components?.[node.name])
}

/** Node types that refer to a label rather than carry one. */
const REFERENCES = new Set(['crossReference', 'footnoteReference', 'footnoteDefinition', 'linkReference', 'imageReference', 'definition', 'cite'])

/**
 * The slide of each label (a section id, a block label, a labelled figure or
 * equation) as a route of the deck, `/<slide number>`: the target of a link
 * to the label.
 */
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

function headmatter(doc: IRDocument, gen: Generation): Record<string, unknown> {
  const { ctx } = gen
  const { theme = 'default', addons = [], ...rest } = Object.fromEntries(Object.entries(ctx.config).filter(([key]) => !RENDERER_KEYS.has(key)))
  // Local paths are relative to the deck; Slidev gets the theme's absolute.
  const local = (name: unknown) => typeof name === 'string' && name.startsWith('.') ? resolve(ctx.deckDir, name) : name
  // Plugins are Slidev addons: their components, setups and layers load in the deck.
  const listed = [...doc.config.plugins, ...Array.isArray(addons) ? addons : [], ...formAddons(doc, ctx)]
  const { htmlAttrs, ...slidev } = rest
  return {
    theme: local(theme),
    title: doc.meta.title,
    favicon: FAVICON,
    ...slidev,
    htmlAttrs: { lang: deckLang(doc), ...typeof htmlAttrs === 'object' ? htmlAttrs : {} },
    addons: [...new Set(listed.filter((name): name is string => typeof name === 'string').map(name => addonPath(name, gen)))],
    presmium: ctx.portable(doc.config.presmium, gen.dir),
  }
}

/**
 * An addon as the generated deck names it: the path of its package directory
 * relative to the directory holding the deck, where Slidev resolves local
 * addons. Slidev looks addons up concurrently and orders them as the lookups
 * finish; local paths need no lookup, so the order of the setups, layers and
 * styles of the slides is the order of `plugins`, the same in every build.
 * Relative, the paths do not tie the slides to where the deck is checked out.
 * A plugin's directory is the one the compiler loaded it from. A package that
 * cannot be found keeps its name, for Slidev to report.
 */
function addonPath(name: string, gen: Generation): string {
  const dir = gen.ctx.pluginDirs[name] ?? packageDir(name, gen.ctx.deckDir)
  if (!dir) return name
  const path = relative(dirname(gen.dir), dir).split('\\').join('/')
  return path.startsWith('.') ? path : `./${path}`
}

/** The directory of a package that is no plugin (a Slidev addon, the web form): a path relative to the deck, or found from it. */
function packageDir(name: string, deckDir: string): string | undefined {
  if (name.startsWith('.') || isAbsolute(name)) {
    const dir = resolve(deckDir, name)
    return existsSync(join(dir, 'package.json')) ? dir : undefined
  }
  for (let d = resolve(deckDir); ; d = dirname(d)) {
    const dir = join(d, 'node_modules', name)
    if (existsSync(join(dir, 'package.json'))) return realpathSync(dir)
    if (dirname(d) === d) return undefined
  }
}

/**
 * The web renderer's package, when the deck has a web form (`renderers.web`,
 * or no renderer configured, so all build): as a Slidev addon it puts the
 * "read on the web" button in the navigation bar (P-74).
 */
function formAddons(doc: IRDocument, ctx: RenderContext): string[] {
  const { renderers } = doc.config
  if (Object.keys(renderers).length > 0 && !renderers.web) return []
  const name = typeof renderers.web?.package === 'string' ? renderers.web.package : WEB_PACKAGE
  return packageDir(name, ctx.deckDir) ? [name] : []
}

/**
 * A slide: the section's `hints.slides` in its frontmatter, and its `{config}`
 * under `presmium`, where the slides host adapter reads it (`useSectionConfig`).
 * The cover's frontmatter is the headmatter, whose `presmium` is the global
 * configuration; the cover's own goes under `presmiumSection`.
 */
function slide(section: IRSection, head: Record<string, unknown>, gen: Generation): string {
  const config = section.config ? { [section.index === 1 ? 'presmiumSection' : 'presmium']: gen.ctx.portable(section.config, gen.dir) } : {}
  const frontmatter = { ...head, ...section.hints.slides, ...config }
  const notes: IRBlock[] = []
  const parts = section.title ? [md({ type: 'heading', depth: 1, children: [{ type: 'text', value: section.title }] }, undefined, gen)] : []
  parts.push(...blocks(section.blocks, gen, notes, false))
  if (notes.length > 0) parts.push(`<!--\n${notesText(notes, gen)}\n-->`)
  const open = Object.keys(frontmatter).length > 0 ? `---\n${stringify(frontmatter).trim()}\n---` : '---'
  return `${open}\n\n${parts.join('\n\n')}\n`
}

/**
 * The visual blocks as Slidev Markdown; narration blocks are collected into
 * `notes`. `owned`: the blocks are a component's children, whose code shows
 * no recorded output, as the component shows it (docs/architecture.md 5.9).
 */
function blocks(list: IRBlock[], gen: Generation, notes: IRBlock[], owned: boolean): string[] {
  const out: string[] = []
  for (const block of list) {
    if (block.role === 'narration') notes.push(block)
    else out.push(visual(block, gen, notes, owned))
  }
  return out
}

function visual(block: IRBlock, gen: Generation, notes: IRBlock[], owned: boolean): string {
  const { node } = block
  if (node.type === 'markdown' && node.reveal === 'items') {
    // Item k at step at + k. Slidev reads an absolute click 0 as "the next click", so a list
    // whose first item shows from the start is placed relatively: our other clicks are absolute.
    return `<v-clicks at="${block.at === 0 ? '+0' : block.at}">\n\n${md(node.mdast, block, gen)}\n\n</v-clicks>`
  }
  const content = node.type === 'markdown' ? md(node.mdast, block, gen)
    : node.type === 'code' ? code(node, block.at, gen, owned)
    : scoped(component(node, block, gen, notes), block.at)
  if (block.at === 0 && block.until === undefined) return content
  const click = block.until === undefined ? `v-click="${block.at}"`
    : block.at === 0 ? `v-click.hide="${block.until}"`
    : `v-click="[${block.at}, ${block.until}]"`
  return `<div ${click}>\n\n${content}\n\n</div>`
}

/**
 * Markdown of a block's mdast: MyST lowered to standard Markdown, with links
 * to labels going to their slides (not in the notes) and local files
 * published with the slides.
 */
function md(tree: MdastNode, block: IRBlock | undefined, gen: Generation, notes = false): string {
  const { mdast } = lowerMyst(verbatim(tree), {
    footnotes: 'gfm',
    iframes: 'element',
    links: notes ? undefined : gen.links,
    urls: block ? (url, type) => asset(url, block, gen, type) : undefined,
  })
  return markdown(slidevNodes(mdast, gen))
}

/** Slidev compiles slides as Vue templates: text with `{{` must not become an interpolation, nor its `$` math. */
function verbatim(node: MdastNode): MdastNode {
  if (node.type === 'text' && node.value?.includes('{{')) {
    return { type: 'html', value: `<span v-pre>${escapeHtml(node.value.replace(/[\\`*_[\]$~|]/g, '\\$&'))}</span>` }
  }
  return node.children ? { ...node, children: node.children.map(verbatim) } : node
}

/**
 * Code in a language Slidev's Shiki knows. Links to slides (`/<n>`) go
 * through Slidev's `<Link>`, which keeps the base; links to published files
 * are HTML links that open the file in a tab of its own, since Slidev makes
 * every Markdown link to a path a route of the deck.
 */
function slidevNodes(node: MdastNode, gen: Generation): MdastNode {
  if (node.type === 'code') return { ...node, lang: codeLang(node.lang), meta: null }
  const html = (value: string): MdastNode => ({ type: 'html', value })
  const children = node.children?.flatMap((child): MdastNode[] => {
    if (child.type !== 'link') return [slidevNodes(child, gen)]
    const url = String(child.url)
    const inner = (child.children ?? []).map(c => slidevNodes(c, gen))
    const slide = /^\/(\d+)$/.exec(url)?.[1]
    if (slide) return [html(`<Link to="${slide}">`), ...inner, html('</Link>')]
    if (!gen.files.has(url)) return [{ ...child, children: inner }]
    const title = typeof child.title === 'string' ? ` title="${escapeHtml(child.title)}"` : ''
    return [html(`<a href="${escapeHtml(url)}"${title} target="_blank" rel="noopener">`), ...inner, html('</a>')]
  })
  return children ? { ...node, children } : node
}

/**
 * The URL of a local file a block names (`RenderContext.localAsset`), which
 * the slides publish at the root of the site; undefined keeps the URL. An
 * image is written as a path from the root, without the base: Vite resolves
 * it to the file in `public/` and adds the base, as Slidev's image preloader
 * does. A link or a component's prop is used as it is written, with the base.
 */
function asset(url: string, block: IRBlock, gen: Generation, type: LinkedType | 'prop'): string | undefined {
  const found = gen.ctx.localAsset(block.source, url)
  if (!found) return undefined
  gen.assets.set(found.name, found.file)
  const path = `${encodeURIComponent(found.name)}${/[?#].*$/s.exec(url)?.[0] ?? ''}`
  if (type === 'image') return `/${path}`
  const published = `${gen.ctx.base}${path}`
  if (type === 'link') gen.files.add(published)
  return published
}

/**
 * A component counts its internal steps from its block's `at` (docs/ir.md 2.4),
 * as in the viewer, which gives every block its `at`: a deck's own component too.
 */
function scoped(content: string, at: number): string {
  return at > 0 ? `<PmStepScope :at="${at}">\n\n${content}\n\n</PmStepScope>` : content
}

function link(className: string, href: string | undefined, text: string, attrs = ''): string {
  return href
    ? `<a class="${className}" href="${escapeHtml(href)}" target="_blank" rel="noopener"${attrs}>${escapeHtml(text)}</a>`
    : `<span class="${className}"${attrs}>${escapeHtml(text)}</span>`
}

/**
 * Where the code comes from (`CodeNode.origin`), above the code: file and
 * lines linked to the repository (the link stays in exported PDFs), the
 * pinned commit or the commit of each version (the one on screen marked,
 * from `$clicks`), and whether pinned code drifted or the anchor moved. With
 * versions, the file, lines and link are those of the version on screen. The
 * web form shows the same bar. One HTML block: no blank line inside.
 */
function originBar(node: CodeNode, at: number, t: Messages): string {
  const { origin } = node
  if (!origin) return ''
  const lines = (start: number, end = start) => end > start ? `${start}-${end}` : `${start}`
  const title = ` title="${escapeHtml(origin.permalink ? t.openInRepository(origin.file) : origin.anchor)}"`
  const variants = node.variants ?? []
  // Version k is on screen from step at + k (the first one from the start) until the next.
  const shown = `Math.min(Math.max($clicks - ${at}, 0), ${variants.length - 1})`
  const file = (href: string | undefined, start: number, end?: number, attrs = '') =>
    link('pm-code-origin__file', href, `${node.title ?? origin.file}:${lines(start, end)}`, `${title}${attrs}`)
  const files = variants.length > 0 && variants.every(v => v.startLine !== undefined)
    ? variants.map((variant, k) => file(variant.permalink, variant.startLine!, variant.endLine, ` v-show="${shown} === ${k}"`))
    : [file(origin.permalink, origin.startLine, origin.endLine)]
  const commits = variants.length
    ? variants.map((variant, k) => link('pm-code-origin__variant', variant.permalink, variant.label, ` :data-active="${shown} === ${k} ? '' : undefined"`))
    : [`<span class="pm-code-origin__commit"${origin.pin ? ` title="${origin.pin}"` : ''}>${origin.pin ? `@ ${origin.pin.slice(0, 7)}` : escapeHtml(t.workingTree)}</span>`]
  const badge = t.status[origin.status]
    ? `<span class="pm-code-origin__badge" data-status="${origin.status}">${escapeHtml(t.status[origin.status]!)}</span>`
    : origin.pin && !variants.length && origin.drift
      ? `<span class="pm-code-origin__badge" data-drift="${origin.drift}">${escapeHtml(origin.drift === 'drifted' ? t.drifted : t.pinned)}</span>`
      : ''
  return `<div class="pm-code-origin" data-anchor="${escapeHtml(origin.anchor)}">\n${[...files, ...commits, badge].filter(Boolean).join('\n')}\n</div>`
}

/**
 * A code block; `highlight` steps through its line sets, `variants` morph with
 * Shiki Magic Move. `owned`: code a component holds shows no recorded output.
 */
function code(node: CodeNode, at: number, gen: Generation, owned: boolean): string {
  // Slidev's `at` on a code block is the click of the second stage; the first is shown with the block.
  const stages = (sets: number[][]) => `{${sets.map(lineRanges).join('|')}}${sets.length > 1 ? `{at:${at + 1}}` : ''}`
  const title = (label?: string) => label ? ` [${label}]` : ''
  let out: string
  if (node.variants?.length) {
    const steps = node.variants.map((variant, k) => {
      const lines = node.highlight?.[k]
      return fence(node.lang, variant.value, `${title(variant.label)}${lines ? ` ${stages([lines])}` : ''}`)
    })
    out = `${'`'.repeat(fenceLength(steps.join('\n')))}md magic-move {at:${at + 1}}\n${steps.join('\n')}\n${'`'.repeat(fenceLength(steps.join('\n')))}`
  } else {
    out = fence(node.lang, node.value, `${title(node.title)}${node.highlight?.length ? ` ${stages(node.highlight)}` : ''}`)
  }
  const outputs = owned ? [] : (node.outputs ?? []).map(run => [run.stdout, run.stderr].filter(Boolean).join('\n').replace(/\n$/, '')).filter(Boolean)
  return [originBar(node, at, gen.t), out, ...outputs.map(text => `<div class="pm-output">\n\n${fence('text', text, '')}\n\n</div>`)].filter(Boolean).join('\n\n')
}

/** A component with its `assets` props set to the URLs of the files the slides publish. */
function published(node: ComponentNode, block: IRBlock, gen: Generation): ComponentNode {
  if (!node.assets) return node
  const props = { ...node.props }
  for (const [prop, url] of Object.entries(node.assets)) props[prop] = asset(url, block, gen, 'prop') ?? url
  return { ...node, props }
}

/** A fallback that shows nothing: an empty root, as a cue with nothing to say has. */
function empty(fallback: MdastNode | undefined): boolean {
  return !fallback || (fallback.type === 'root' && !fallback.children?.length)
}

/**
 * A plugin component: the plugin's Slidev extension when it has one, else the
 * component tag (plugins are addons, so Slidev registers their components).
 * A component no plugin provides degrades to its `fallback` (docs/ir.md section 6).
 * One with a `fallback` shows it in PDF and PNG exports (`PmStaticFallback` of
 * @presmium/slidev-addon-core), so an export never depends on what the
 * component did at run time; an overlay with nothing to show there is left
 * as it is. The renderer isolates each plugin component in a `PmBoundary`
 * of @presmium/host (K-07): an error in it, even in its own setup, leaves a
 * placeholder and the rest of the slide.
 */
function component(original: ComponentNode, block: IRBlock, gen: Generation, notes: IRBlock[]): string {
  const node = published(original, block, gen)
  const extension = gen.ctx.extensionFor(node)
  if (!extension && !node.plugin) return node.fallback ? md(node.fallback, block, gen) : `> ${gen.t.webOnly(node.name)}`
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
  // `v-slot:` rather than `#`: Markdown reads the tag as HTML only with attribute names it knows.
  const content = empty(node.fallback) && (node.layer === 'overlay' || !node.fallback)
    ? live
    : `<PmStaticFallback>\n\n${live}\n\n<template v-slot:fallback>\n\n${md(node.fallback!, block, gen)}\n\n</template>\n</PmStaticFallback>`
  return `<PmBoundary name="${escapeHtml(node.name)}">\n\n${content}\n\n</PmBoundary>`
}

/**
 * A component's tag. The URL of a file it shows is bound as an expression:
 * Slidev's image preloader adds the base to the `src` it reads in a slide,
 * which holds it already.
 */
function tag(node: ComponentNode, gen: Generation, notes: IRBlock[]): string {
  const attrs = Object.entries(node.props).map(([name, value]) => typeof value === 'string' && !node.assets?.[name]
    ? ` ${name}="${escapeHtml(value).replace(/\n/g, '&#10;')}"`
    // A Vue expression in single quotes: JSON with `'` and `&` escaped stays valid JavaScript.
    : ` :${name}='${JSON.stringify(value).replace(/'/g, '\\u0027').replace(/&/g, '\\u0026')}'`).join('')
  const children = node.children ? blocks(node.children, gen, notes, true) : []
  return children.length > 0 ? `<${node.name}${attrs}>\n\n${children.join('\n\n')}\n\n</${node.name}>` : `<${node.name}${attrs} />`
}

/**
 * Notes in step order. `[click:n]` moves the highlight n clicks on from the
 * previous marker, so the narration of step s is highlighted from step s.
 */
function notesText(notes: IRBlock[], gen: Generation): string {
  let step = 0
  return [...notes].sort((a, b) => a.at - b.at).map((block) => {
    const { node } = block
    let text = node.type === 'markdown' ? md(node.mdast, block, gen, true)
      : node.type === 'code' ? fence(node.lang, node.value, '')
      : node.fallback ? md(node.fallback, block, gen, true) : ''
    if (block.at > step) {
      // A marker opens a paragraph; before any other block it stands as a paragraph of its own.
      const marker = block.at - step === 1 ? '[click]' : `[click:${block.at - step}]`
      text = node.type === 'markdown' && node.mdast.children?.[0]?.type === 'paragraph' ? `${marker} ${text}` : `${marker}\n\n${text}`
      step = block.at
    }
    return text
  }).join('\n\n').replace(/-->/g, '--&gt;')
}

function fence(lang: string, value: string, info: string): string {
  const ticks = '`'.repeat(fenceLength(value))
  return `${ticks}${codeLang(lang)}${info}\n${value}\n${ticks}`
}

function fenceLength(value: string): number {
  return Math.max(3, ...[...value.matchAll(/`+/g)].map(m => m[0].length + 1))
}

/** `[1, 2, 3, 5]` -> `1-3,5`; an empty set highlights nothing in particular. */
function lineRanges(lines: number[]): string {
  if (lines.length === 0) return 'all'
  const sorted = [...new Set(lines)].sort((a, b) => a - b)
  const ranges: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!
    while (sorted[i + 1] === sorted[i]! + 1) i++
    ranges.push(sorted[i] === start ? `${start}` : `${start}-${sorted[i]}`)
  }
  return ranges.join(',')
}
