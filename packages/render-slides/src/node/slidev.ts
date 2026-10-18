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
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_LANG, deckLocale, docBlocks, errorMessage, escapeHtml, languageId, lowerMyst, nodeMdast, publishedUrl, roleMark, withProp } from '@presmium/kernel'
import type { CodeNode, ComponentNode, IRBlock, IRDocument, IRSection, LinkedType, LocalAsset, Locale, MdastNode, RenderContext, RunOutput, RunResult } from '@presmium/kernel'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { originParts, outputNotes } from '@presmium/viewer/domain'
import type { OriginPart } from '@presmium/viewer/domain'
import { stringify } from 'yaml'
import { sanitizedHtml } from './html.ts'
import { codeLang, markdown } from './markdown.ts'

/** What the generated deck says itself, in the deck's language; the origin bar of code says what the web form's does (`@presmium/viewer/domain`). */
const MESSAGES = {
  'zh-CN': {
    webOnly: (name: string) => `组件 ${name} 只能在网页中查看。`,
  },
  'en': {
    webOnly: (name: string) => `The component ${name} can only be viewed on the web.`,
  },
} satisfies Record<Locale, unknown>

type Messages = (typeof MESSAGES)[Locale]

/** The generated deck: its Markdown and the local files it publishes, by published name. */
export interface SlidevDeck {
  markdown: string
  /** Published name (`<hash>-<name>`, at the root of the site) -> the file (`RenderContext.localAsset`). */
  assets: Map<string, LocalAsset>
}

/** One generation of the deck. */
interface Generation {
  ctx: RenderContext
  /** Directory of the generated deck; relative paths are written against it. */
  dir: string
  /** The deck's UI language. */
  locale: Locale
  t: Messages
  assets: Map<string, LocalAsset>
  /** URLs of the published files that links point to. */
  files: Set<string>
  /** The slide route of a label in the deck, for links to it. */
  links: (label: string) => string | undefined
  /** The id of the section being written. */
  section: string
  /** Whether code that runs live runs in the slides (`renderers.slides.liveCode`, default true). */
  live: boolean
  /** The chapter of each section below one, by section id: the title its slide shows above its own. */
  chapters: Map<string, string>
}

/**
 * A favicon of the deck's own. Slidev's default is a remote image that its
 * build downloads under the generated deck and refers to by a path from the
 * file system root, so the slides would depend on where the deck is checked out.
 */
const FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#0f5f5c"/></svg>')}`

/** The deck's language: its `lang`, else the default; both forms put it in `<html lang>`. */
export function deckLang(doc: IRDocument): string {
  return typeof doc.meta.lang === 'string' && doc.meta.lang ? doc.meta.lang : DEFAULT_LANG
}

/**
 * Keys of `renderers.slides` that configure the renderer rather than the
 * Slidev headmatter. `liveCode: false` writes code that runs live as static
 * code with its recorded output, as an export shows it (`presmium-export`).
 */
const RENDERER_KEYS = new Set(['package', 'base', 'port', 'liveCode'])

/** Package of the web renderer, unless `renderers.web.package` names another. */
const WEB_PACKAGE = '@presmium/web'

/**
 * Presmium's own Slidev theme, 书卷 (../../theme, docs/architecture.md 5.12): the
 * slides' theme unless `renderers.slides.theme` names one (`default` is
 * Slidev's).
 */
const THEME_DIR = fileURLToPath(new URL('../../theme', import.meta.url))

/** `dir` is the directory of the generated deck. */
export function slidevMarkdown(doc: IRDocument, ctx: RenderContext, dir: string): SlidevDeck {
  const locale = deckLocale(ctx.lang ?? deckLang(doc))
  const generation: Generation = { ctx, dir, locale, t: MESSAGES[locale], assets: new Map(), files: new Set(), links: slideLinks(doc), section: '', live: ctx.config.liveCode !== false, chapters: chapters(doc) }
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

/**
 * The chapter of each section: the title of the outermost section that holds
 * it (a lower heading depth, not the cover's), as the slides of the theme show
 * it above their title (`presmiumChapter`).
 */
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

function headmatter(doc: IRDocument, gen: Generation): Record<string, unknown> {
  const { ctx } = gen
  // The addons are the deck's (`addonNames`).
  const { theme, ...rest } = Object.fromEntries(Object.entries(ctx.config).filter(([key]) => !RENDERER_KEYS.has(key) && key !== 'addons'))
  // Local paths are relative to the deck; Slidev gets the theme's absolute. By default Presmium's own
  // theme, relative to the generated deck.
  const local = (name: unknown) => typeof name === 'string' && name.startsWith('.') ? resolve(ctx.deckDir, name) : name
  const { htmlAttrs, ...slidev } = rest
  return {
    theme: theme === undefined ? relativePath(gen.dir, THEME_DIR) : local(theme),
    title: doc.meta.title,
    favicon: FAVICON,
    ...typesSource(doc, gen),
    ...slidev,
    htmlAttrs: { lang: deckLang(doc), ...typeof htmlAttrs === 'object' ? htmlAttrs : {} },
    addons: [...new Set(addonNames(doc, ctx).map(name => addonPath(name, gen)))],
    presmium: ctx.portable(doc.config.presmium, gen.dir),
    // Slidev's dev server has an MCP endpoint that edits the generated deck; agents edit the source (principle 6).
    mcp: false,
    // In `presmium dev` the Presmium server serves the slides too (`/__presmium/`, proxied in vite.config.ts); a
    // preview of the workspace service (docs/design-dsh.md 4.2) is on the service's origin, and names its document.
    ...ctx.server || ctx.preview ? { presmiumServer: true } : {},
    ...ctx.preview ? { presmiumDocument: previewDocument(ctx) } : {},
    // The named environments, for addon-core to give the kernel (`HostStart.environments`).
    ...doc.config.execute?.environments ? { presmiumEnvironments: ctx.portable(doc.config.execute.environments, gen.dir) } : {},
    ...runnerOptions(doc, gen),
  }
}

/** The document of a preview: the deck's directory, relative to the workspace root (the workspace service's compilers have its root). */
export function previewDocument(ctx: RenderContext): string {
  return relative(ctx.workspaceRoot, ctx.deckDir).split('\\').join('/')
}

/**
 * The deck's Slidev addons: the plugins the compiler loaded (one it refused,
 * for another kernel or another Presmium, P-143, is left out, as in the web
 * form), the addons `renderers.slides.addons` names, and the web form's
 * package (`formAddons`).
 */
function addonNames(doc: IRDocument, ctx: RenderContext): string[] {
  const { addons } = ctx.config
  const plugins = doc.config.plugins.filter(name => ctx.pluginDirs[name] !== undefined)
  const listed = [...plugins, ...Array.isArray(addons) ? addons : [], ...formAddons(doc, ctx)]
  return listed.filter((name): name is string => typeof name === 'string')
}

/** The package directories of the deck's addons that are found (`addonPath`). */
export function addonDirs(doc: IRDocument, ctx: RenderContext): string[] {
  return addonNames(doc, ctx).flatMap(name => ctx.pluginDirs[name] ?? packageDir(name, ctx.deckDir) ?? [])
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
  return dir ? relativePath(dirname(gen.dir), dir) : name
}

/**
 * A directory as a path relative to `from`, starting with `.`, as Slidev
 * takes a local addon (from the directory holding the deck) or theme (from
 * the deck's own). Slidev puts the deck's configuration, the theme's name
 * too, into the built slides, which hold no path of the machine (Principle 5).
 */
function relativePath(from: string, dir: string): string {
  const path = relative(from, dir).split('\\').join('/')
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
 * configuration; the cover's own goes under `presmiumSection`. Its title and
 * blocks are in its section's anchor (`[data-section]`, docs/design-dsh.md
 * 4.4), as the web form's sections, which takes no box of its own
 * (`.pm-slide-section`, ../deck/style.css); the notes stay last, where Slidev
 * reads them.
 */
function slide(section: IRSection, head: Record<string, unknown>, gen: Generation): string {
  gen.section = section.id
  const config = section.config ? { [section.index === 1 ? 'presmiumSection' : 'presmium']: gen.ctx.portable(section.config, gen.dir) } : {}
  const chapter = gen.chapters.get(section.id)
  const frontmatter = { ...head, ...section.hints.slides, ...config, ...chapter ? { presmiumChapter: chapter } : {} }
  const notes: IRBlock[] = []
  const parts = section.title ? [md({ type: 'heading', depth: 1, children: [{ type: 'text', value: section.title }] }, undefined, gen)] : []
  parts.push(...blocks(section.blocks, gen, notes, false))
  const body = [`<div class="pm-slide-section" data-section="${escapeHtml(section.id)}">\n\n${parts.join('\n\n')}\n\n</div>`]
  if (notes.length > 0) body.push(`<!--\n${notesText(notes, gen)}\n-->`)
  const open = Object.keys(frontmatter).length > 0 ? `---\n${stringify(frontmatter).trim()}\n---` : '---'
  return `${open}\n\n${body.join('\n\n')}\n`
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

/**
 * A visual block, wrapped in the clicks of its step. The wrapper of a
 * component's child is keyed by the child's block id, as the web form keys
 * the child itself, so the component can tell what appears at a later step
 * apart from the rest (a predict, what it reveals from its prompt). A block
 * of the slide itself is in its anchor (docs/design-dsh.md 4.4), as the web
 * form's blocks: `.pm-block[data-block]`, with its section (`data-section`)
 * and the step it appears at (`data-step`), around its clicks, for the
 * preview protocol and the plugins that point at a block; a block that is
 * not content where it stands has none (`unanchored`).
 */
function visual(block: IRBlock, gen: Generation, notes: IRBlock[], owned: boolean): string {
  const { node } = block
  const key = owned ? ` key="${escapeHtml(block.id)}"` : ''
  const wrap = (content: string) => (owned || unanchored(block) ? content : `<div class="pm-block" data-block="${escapeHtml(block.id)}" data-section="${escapeHtml(gen.section)}" data-step="${block.at}">\n\n${content}\n\n</div>`)
  if (node.type === 'markdown' && node.reveal === 'items') {
    // Item k at step at + k. Slidev reads an absolute click 0 as "the next click", so a list
    // whose first item shows from the start is placed relatively: our other clicks are absolute.
    return wrap(`<v-clicks at="${block.at === 0 ? '+0' : block.at}"${key}>\n\n${md(node.mdast, block, gen)}\n\n</v-clicks>`)
  }
  const content = node.type === 'markdown' ? md(node.mdast, block, gen)
    : node.type === 'code' ? code(node, block, gen, owned)
    : scoped(component(node, block, gen, notes), block.at)
  if (block.at === 0 && block.until === undefined) return wrap(content)
  const click = block.until === undefined ? `v-click="${block.at}"`
    : block.at === 0 ? `v-click.hide="${block.until}"`
    : `v-click="[${block.at}, ${block.until}]"`
  return wrap(`<div ${click}${key}>\n\n${content}\n\n</div>`)
}

/** What a block may be made of and still be no content where it stands. */
const NOT_CONTENT = new Set(['html', 'footnoteDefinition', 'definition'])

/**
 * Whether a block is no content where it stands, so it has no anchor: raw
 * HTML only, which may open or close an element that the slide's next blocks
 * are in (a `<div style=…>` before them, its `</div>` after them), which an
 * anchor around it would close at once; footnote and link definitions, which
 * Slidev shows elsewhere or not at all.
 */
function unanchored(block: IRBlock): boolean {
  const { node } = block
  if (node.type !== 'markdown') return false
  const children = node.mdast.type === 'root' ? node.mdast.children ?? [] : [node.mdast]
  return children.length > 0 && children.every(child => NOT_CONTENT.has(child.type))
}

/**
 * Markdown of a block's mdast: MyST lowered to standard Markdown, with links
 * to labels going to their slides (not in the notes) and local files
 * published with the slides.
 */
function md(tree: MdastNode, block: IRBlock | undefined, gen: Generation, notes = false): string {
  const { mdast } = lowerMyst(buttons(verbatim(gen.ctx.preview && !notes ? authorMarks(tree) : tree)), {
    footnotes: 'gfm',
    iframes: 'element',
    // Cards, grids and tabs as HTML elements, laid out by the deck's styles (../deck/style.css).
    cards: 'element',
    links: notes ? undefined : gen.links,
    urls: block ? (url, type) => asset(url, block, gen, type, notes) : undefined,
    // Raw HTML's too (docs/ir.md 6.2): Vue resolves `src` and `poster` of a slide as an image's; an `href` is a link.
    htmlUrls: true,
    // The presenter sees where a role without children stands, e.g. a cue (docs/ir.md 2.8).
    roles: notes ? 'marks' : 'children',
  })
  return markdown(slidevNodes(mdast, gen))
}

/**
 * Where a role without children stands on a slide of a preview (a `{cue}`,
 * `RenderContext.preview`): an empty mark that shows `〔<name> <value>〕` only
 * while the page shows the author's marks (the class `AUTHOR_MARKS_CLASS` of
 * `<html>`, the preview protocol's `marks`; ../deck/style.css), as the web
 * form's `PmRoleMark` does. Elsewhere only the notes show the marks, as text.
 */
function authorMarks(node: MdastNode): MdastNode {
  if (node.type === 'presmiumRole' && !node.children?.length) return { type: 'html', value: `<span class="pm-role-mark" data-mark="${escapeHtml(roleMark(node))}"></span>` }
  return node.children ? { ...node, children: node.children.map(authorMarks) } : node
}

/** Slidev compiles slides as Vue templates: text with `{{` must not become an interpolation, nor its `$` math. */
function verbatim(node: MdastNode): MdastNode {
  if (node.type === 'text' && node.value?.includes('{{')) {
    return { type: 'html', value: `<span v-pre>${escapeHtml(node.value.replace(/[\\`*_[\]$~|]/g, '\\$&'))}</span>` }
  }
  return node.children ? { ...node, children: node.children.map(verbatim) } : node
}

/**
 * A `{button}` without a target (a `span` of class `button`) as text styled
 * as a button, as one with a link is (`pm-button`, ../deck/style.css).
 */
function buttons(node: MdastNode): MdastNode {
  if (!node.children) return node
  const button = (child: MdastNode) => child.type === 'span' && typeof child.class === 'string' && child.class.split(/\s+/).includes('button')
  return {
    ...node,
    children: node.children.flatMap(child => button(child)
      ? [{ type: 'html', value: '<span class="pm-button pm-button--text">' }, ...(child.children ?? []).map(buttons), { type: 'html', value: '</span>' }]
      : [buttons(child)]),
  }
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
 * image in a slide is written as a path from the root, without the base:
 * Vite resolves it to the file in `public/` and adds the base, as Slidev's
 * image preloader does. A link, a component's prop and anything in the
 * notes (`notes`: Slidev shows their HTML as it is, without Vite) are used
 * as they are written, with the base.
 */
function asset(url: string, block: IRBlock, gen: Generation, type: LinkedType | 'prop', notes = false): string | undefined {
  const found = gen.ctx.localAsset(block.source, url)
  if (!found) return undefined
  gen.assets.set(found.name, found)
  // A directory opens at its file listing (docs/ir.md 6.2).
  if (type === 'image' && !notes) return publishedUrl(found, url, { prefix: '/' })
  const published = publishedUrl(found, url, { prefix: gen.ctx.base })
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

/** A part of the origin bar (`originParts`), as HTML; `attrs` are written after its own. */
function originPart(part: OriginPart, attrs = ''): string {
  const own = [
    part.title ? ` title="${escapeHtml(part.title)}"` : '',
    part.status ? ` data-status="${part.status}"` : '',
    part.drift ? ` data-drift="${part.drift}"` : '',
  ].join('')
  return link(`pm-code-origin__${part.kind}`, part.href, part.text, `${own}${attrs}`)
}

/**
 * Where the code comes from (`CodeNode.origin`), above the code: the parts
 * the web form shows (`originParts` of @presmium/viewer), the file and lines
 * linked to the repository (the link stays in exported PDFs), the pinned
 * commit or the commit of each version, and a badge. With versions, the file
 * part of the version on screen shows (from `$clicks`) and its commit is
 * marked. One HTML block: no blank line inside.
 */
function originBar(node: CodeNode, at: number, locale: Locale): string {
  // A titled listing without an origin has its title on the code block (`fence`).
  const bar = node.origin && originParts(node, undefined, locale)
  if (!bar) return ''
  const variants = node.variants ?? []
  // Version k is on screen from step at + k (the first one from the start) until the next.
  const shown = `Math.min(Math.max($clicks - ${at}, 0), ${variants.length - 1})`
  const parts = bar.parts.flatMap((part) => {
    if (part.kind === 'file' && variants.length) {
      return variants.map((_, k) => originPart(originParts(node, k, locale)!.parts[0]!, ` v-show="${shown} === ${k}"`))
    }
    if (part.kind === 'variant') {
      const k = bar.parts.filter(p => p.kind === 'variant').indexOf(part)
      return [originPart(part, ` :data-active="${shown} === ${k} ? '' : undefined"`)]
    }
    return [originPart(part)]
  })
  return `<div class="pm-code-origin"${bar.anchor ? ` data-anchor="${escapeHtml(bar.anchor)}"` : ''}>\n${parts.join('\n')}\n</div>`
}

/**
 * Languages the slides run in a Monaco Runner (`{monaco-run}`), by the name
 * the execution plugin's code runners know them: Python, JavaScript and
 * TypeScript, and C, C++, Ruby and SQL, which run on the executor of their
 * language or environment (the WASI runtimes the slides publish).
 */
const RUNNER_LANGS: Record<string, string> = {
  'python': 'python',
  'javascript': 'javascript',
  'typescript': 'typescript',
  'c': 'c',
  'cpp': 'cpp',
  'c++': 'cpp',
  'cc': 'cpp',
  'cxx': 'cpp',
  'ruby': 'ruby',
  'rb': 'ruby',
  'sql': 'sql',
  'sqlite': 'sql',
}

/** The runner's name of a code block's language, if the slides run it. */
const runnerLang = (lang: string): string | undefined => Object.hasOwn(RUNNER_LANGS, languageId(lang)) ? RUNNER_LANGS[languageId(lang)] : undefined
/** Base64 longer than this is published as a file rather than written into the slide. */
const INLINE_IMAGE = 16_384
const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }

const joined = (value: unknown): string => (Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : JSON.stringify(value, null, 2))
// eslint-disable-next-line no-control-regex
const plain = (text: string) => text.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '')

/** The URL of an image output: inline, or a file published with the slides when it is large. */
function imageUrl(type: string, base64: string, gen: Generation): string {
  if (base64.length <= INLINE_IMAGE) return `data:${type};base64,${base64}`
  const data = Buffer.from(base64, 'base64')
  const hash = createHash('sha256').update(data).digest('hex')
  const name = `${hash.slice(0, 8)}-output.${IMAGE_TYPES[type]}`
  // In the renderer's own work directory, not the shared temporary one where another user could put a file first.
  const file = join(gen.ctx.workDir, 'outputs', `${hash}.${IMAGE_TYPES[type]}`)
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
  }
  gen.assets.set(name, { file, name })
  return `${gen.ctx.base}${name}`
}

/** Markdown a run printed, as the slide's Markdown; raw HTML in it is kept as text. */
function markdownOutput(text: string, block: IRBlock, gen: Generation): string {
  const literal = (node: MdastNode): MdastNode => node.type === 'html' ? { type: 'text', value: String(node.value ?? '') } : node.children ? { ...node, children: node.children.map(literal) } : node
  return md(literal(fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as unknown as MdastNode), block, gen)
}

/**
 * A rich output in the slide (docs/ir.md 6.1): an image (`<img>`), Markdown
 * as Markdown, HTML sanitized as the web form does (./html.ts) and shown in
 * the slide with the deck's styles, so it shows whole and in exports (one
 * HTML block, which Vue does not compile: `v-pre`), LaTeX as math, other
 * types and the streams as text.
 */
function richOutput(output: RunOutput, block: IRBlock, gen: Generation): string {
  if (output.output_type === 'stream') return fence('text', plain(joined(output.text)).replace(/\n$/, ''), '')
  if (output.output_type === 'error') return fence('text', plain(output.traceback.join('\n')) || `${output.ename}: ${output.evalue}`, '')
  const { data } = output
  const image = Object.keys(IMAGE_TYPES).find(type => data[type] !== undefined)
  if (image) return `<img class="pm-output__image" alt="" src="${escapeHtml(imageUrl(image, joined(data[image]).replace(/\s/g, ''), gen))}">`
  if (data['image/svg+xml'] !== undefined) return `<img class="pm-output__image" alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(joined(data['image/svg+xml']))}">`
  if (data['text/markdown'] !== undefined) return markdownOutput(joined(data['text/markdown']), block, gen)
  if (data['text/html'] !== undefined) return `<div class="pm-output__html" v-pre>${sanitizedHtml(joined(data['text/html'])).replace(/\n\s*\n/g, '\n')}</div>`
  if (data['text/latex'] !== undefined) return `$$\n${joined(data['text/latex']).trim().replace(/^\$\$?|\$\$?$/g, '')}\n$$`
  const text = data['text/plain'] ?? data['application/json']
  return text === undefined ? '' : fence('text', plain(joined(text)).replace(/\n$/, ''), '')
}

/**
 * A run's recorded output, with what it says about the run (`outputNotes`);
 * empty when it has neither. `prose`: code with `echo: false` whose outputs
 * are Markdown, which shows as the slide's text, without the output box.
 */
function output(run: RunResult, block: IRBlock, gen: Generation, prose = false): string {
  const parts = run.outputs
    ? run.outputs.map(o => richOutput(o, block, gen))
    : [[run.stdout, run.stderr].filter(Boolean).join('\n').replace(/\n$/, '')].filter(Boolean).map(text => fence('text', text, ''))
  if (prose) return parts.filter(Boolean).join('\n\n')
  const notes = outputNotes(run, gen.locale)
  if (parts.every(part => !part) && notes.length === 0) return ''
  if (notes.length) parts.push(`<p class="pm-output__note">${escapeHtml(notes.join(' · '))}</p>`)
  return `<div class="pm-output">\n\n${parts.filter(Boolean).join('\n\n')}\n\n</div>`
}

/** The key of a block's runner options in the headmatter. */
const runnerKey = (section: string, block: string) => `${section}/${block}`

/** Whether code runs in the slides' Monaco Runner (`monacoRun`); an export's deck runs none (`renderers.slides.liveCode: false`). */
function runsLive(node: CodeNode, gen: Generation): boolean {
  return Boolean(gen.live && node.run && node.run.when !== 'compile' && node.echo !== false && !node.variants?.length && !node.highlight?.length && runnerLang(node.lang))
}

/** The packages a module imports by name (`import … from`, `export … from`, `import '…'`, `import('…')`), without their subpaths. */
function importedPackages(code: string): string[] {
  const names = [...code.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*(['"])([^'"\n]+)\1/g)].map(match => match[2]!)
  return names
    .filter(name => !/^[./]/.test(name) && !name.includes(':'))
    .map(name => name.split('/').slice(0, name.startsWith('@') ? 2 : 1).join('/'))
}

/**
 * Slidev looks up the types of the packages that live JavaScript and
 * TypeScript code imports from the generated deck (`monacoTypesSource:
 * local`), and fails the build for one it cannot find there: jax-js, for
 * one, comes with the WebGPU plugin, not with the deck. The deck is then
 * written with `monacoTypesSource: none`: the editor has no types, the code
 * runs as before. `renderers.slides.monacoTypesSource` overrides it.
 */
function typesSource(doc: IRDocument, gen: Generation): Record<string, unknown> {
  const scripts = doc.sections.flatMap(section => section.blocks).map(block => block.node)
    .filter((node): node is CodeNode => node.type === 'code' && runsLive(node, gen) && ['javascript', 'typescript'].includes(runnerLang(node.lang)!))
  return scripts.some(node => importedPackages(node.value).some(name => !packageDir(name, gen.dir))) ? { monacoTypesSource: 'none' } : {}
}

/**
 * A recording as the execution plugin's runner shows it (`recording` of the
 * runner's options): what the run printed and its rich outputs, a large
 * image published as a file and shown by its URL.
 */
function runnerRecording(run: RunResult, gen: Generation): Record<string, unknown> {
  const outputs = run.outputs?.map((output): RunOutput => {
    if (output.output_type !== 'display_data' && output.output_type !== 'execute_result') return output
    const image = Object.keys(IMAGE_TYPES).find(type => output.data[type] !== undefined)
    const base64 = image && joined(output.data[image]).replace(/\s/g, '')
    if (!image || !base64 || base64.length <= INLINE_IMAGE) return output
    return { ...output, data: { 'text/html': `<img class="pm-run-image" alt="" src="${escapeHtml(imageUrl(image, base64, gen))}">` } }
  })
  return { ok: run.ok, stdout: run.stdout, stderr: run.stderr, ...outputs ? { outputs } : {} }
}

/**
 * The runner options of the code that runs live, in the headmatter
 * (`presmiumRuns`, by section and block): its key, executor, session and
 * timeout, and the output recorded at compile time, which the runner shows
 * until the code is run. Slidev reads a code block's props up to the first
 * `}`, so they cannot be written on the fence; the fence refers to them
 * through `$slidev.configs`, an object that stays the same while the slide
 * shows (the runner tells its first call by it).
 */
function runnerOptions(doc: IRDocument, gen: Generation): Record<string, unknown> {
  const runs: Record<string, Record<string, unknown>> = {}
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      const { node } = block
      if (node.type !== 'code' || !runsLive(node, gen)) continue
      const { executor, session, timeoutMs } = node.run!
      const recording = node.outputs?.at(-1)
      const key = runnerKey(section.id, block.id)
      runs[key] = {
        block: key,
        ...executor ? { executor } : {},
        ...session ? { session } : {},
        ...timeoutMs ? { timeout: timeoutMs } : {},
        ...recording ? { recording: runnerRecording(recording, gen) } : {},
      }
    }
  }
  return Object.keys(runs).length ? { presmiumRuns: runs } : {}
}

/**
 * Code that also runs live (`:run: live` or `both`), as Slidev's Monaco
 * Runner: the execution plugin's code runners run it with the executor of
 * its environment and its session (`runnerOptions`). Its output area is the
 * code's one output: the runner is called once when the slide loads
 * (`autorun: 'once'`), which shows the recorded output (docs/architecture.md
 * 9.2); the code runs on request, not when the slide shows.
 */
function monacoRun(node: CodeNode, block: IRBlock, gen: Generation): string {
  const options = `runnerOptions:$slidev.configs.presmiumRuns['${runnerKey(gen.section, block.id).replace(/['\\]/g, '\\$&')}']`
  return fence(runnerLang(node.lang)!, node.value, ` {monaco-run} {autorun:'once',height:'auto',${options}}`)
}

/**
 * A code block; `highlight` steps through its line sets, `variants` morph with
 * Shiki Magic Move. `owned`: code a component holds shows no recorded output.
 */
function code(node: CodeNode, block: IRBlock, gen: Generation, owned: boolean): string {
  const at = block.at
  // Slidev's `at` on a code block is the click of the second stage; the first is shown with the block.
  const stages = (sets: number[][]) => `{${sets.map(lineRanges).join('|')}}${sets.length > 1 ? `{at:${at + 1}}` : ''}`
  const title = (label?: string) => label ? ` [${label}]` : ''
  let out: string
  if (node.echo === false) {
    // Only the output shows (P-102): Markdown output as the slide's text.
    const runs = node.outputs ?? []
    const prose = runs.length > 0 && runs.every(r => r.outputs?.length && r.outputs.every(o => o.output_type !== 'stream' && o.output_type !== 'error' && o.data['text/markdown'] !== undefined))
    return runs.map(run => output(run, block, gen, prose)).filter(Boolean).join('\n\n')
  } else if (!owned && runsLive(node, gen)) {
    // The runner's output area shows the recorded output.
    return [originBar(node, at, gen.locale), monacoRun(node, block, gen)].filter(Boolean).join('\n\n')
  } else if (node.variants?.length) {
    const steps = node.variants.map((variant, k) => {
      const lines = node.highlight?.[k]
      return fence(node.lang, variant.value, `${title(variant.label)}${lines ? ` ${stages([lines])}` : ''}`)
    })
    out = `${'`'.repeat(fenceLength(steps.join('\n')))}md magic-move {at:${at + 1}}\n${steps.join('\n')}\n${'`'.repeat(fenceLength(steps.join('\n')))}`
  } else {
    out = fence(node.lang, node.value, `${title(node.title)}${node.highlight?.length ? ` ${stages(node.highlight)}` : ''}`)
  }
  const outputs = owned ? [] : (node.outputs ?? []).map(run => output(run, block, gen))
  return [originBar(node, at, gen.locale), out, ...outputs].filter(Boolean).join('\n\n')
}

/** A component with its `assets` props set to the URLs of the files the slides publish. */
function published(node: ComponentNode, block: IRBlock, gen: Generation): ComponentNode {
  if (!node.assets) return node
  let props = node.props
  for (const [path, url] of Object.entries(node.assets)) props = withProp(props, path, asset(url, block, gen, 'prop') ?? url)
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
    : `<PmStaticFallback>\n\n${live}\n\n<template v-slot:fallback>\n\n${md(unfolded(node.fallback!), block, gen)}\n\n</template>\n</PmStaticFallback>`
  return `<PmBoundary name="${escapeHtml(node.name)}">\n\n${content}\n\n</PmBoundary>`
}

/**
 * A fallback as an export shows it: nothing can be unfolded in a PDF or a
 * PNG, so what the fallback folds away in a `<details>` marked
 * `data-static="open"` (what a predict reveals, docs/ir.md 2.13) is written
 * open; other folds stay closed (a quiz's answer).
 */
function unfolded(node: MdastNode): MdastNode {
  if (node.type === 'html' && typeof node.value === 'string') return { ...node, value: node.value.replace(/<details(?=[^>]*\sdata-static="open")/g, '<details open') }
  return node.children ? { ...node, children: node.children.map(unfolded) } : node
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
