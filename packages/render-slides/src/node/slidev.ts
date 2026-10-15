/**
 * IR to the Markdown of a Slidev deck (docs/ir.md section 6): one slide per
 * section, the section title as its heading and `hints.slides` as its
 * frontmatter. Visual blocks appear at their step through absolute `v-click`
 * positions; a component block gets its `at` as step scope (`<PmStepScope>`
 * of @presmium/host), from which the component counts its internal steps.
 * Narration becomes the slide notes, split by `[click]` markers.
 */
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { CodeNode, CodeOrigin, CodeVariant, ComponentNode, IRBlock, IRDocument, IRSection, RendererExtension } from '@presmium/kernel'
import { stringify } from 'yaml'
import { codeLang, escapeHtml, markdown } from './markdown.ts'

export interface SlidevOptions {
  /** Directory of the generated deck; relative paths are rewritten against it. */
  dir: string
  deckDir: string
  /** `renderers.slides` from the frontmatter: Slidev headmatter, plus the renderer's own keys. */
  config: Record<string, unknown>
  extensions: RendererExtension[]
}

/** Keys of `renderers.slides` that configure the renderer rather than the Slidev headmatter. */
const RENDERER_KEYS = new Set(['package', 'base', 'port'])

/** Package of the web renderer, unless `renderers.web.package` names another. */
const WEB_PACKAGE = '@presmium/web'

export function slidevMarkdown(doc: IRDocument, options: SlidevOptions): string {
  return doc.sections.map((section, i) => slide(section, i === 0 ? headmatter(doc, options) : {}, options)).join('\n')
}

/** Whether a plugin renders the component for this renderer (a `rendererExtensions.slides` entry). */
export function extensionFor(node: ComponentNode, extensions: RendererExtension[]) {
  return extensions.find(e => e.components?.[node.name])?.components?.[node.name]
}

function headmatter(doc: IRDocument, options: SlidevOptions): Record<string, unknown> {
  const { theme = 'default', addons = [], ...rest } = Object.fromEntries(Object.entries(options.config).filter(([key]) => !RENDERER_KEYS.has(key)))
  // Local paths are relative to the deck; Slidev gets them absolute.
  const local = (name: unknown) => typeof name === 'string' && name.startsWith('.') ? resolve(options.deckDir, name) : name
  // Plugins are Slidev addons: their components, setups and layers load in the deck.
  const listed = [...doc.config.plugins, ...Array.isArray(addons) ? addons : [], ...formAddons(doc, options.deckDir)]
  return {
    theme: local(theme),
    title: doc.meta.title,
    ...doc.meta.lang ? { htmlAttrs: { lang: doc.meta.lang } } : {},
    ...rest,
    addons: [...new Set(listed.map(local))],
    presmium: doc.config.presmium,
  }
}

/** Whether a package (a name, or a path relative to the deck) can be found from the deck, as the compiler looks plugins up. */
function installed(name: string, deckDir: string): boolean {
  if (name.startsWith('.') || isAbsolute(name)) return existsSync(join(resolve(deckDir, name), 'package.json'))
  for (let d = resolve(deckDir); ; d = dirname(d)) {
    if (existsSync(join(d, 'node_modules', name, 'package.json'))) return true
    if (dirname(d) === d) return false
  }
}

/**
 * The web renderer's package, when the deck has a web form (`renderers.web`,
 * or no renderer configured, so all build): as a Slidev addon it puts the
 * "read on the web" button in the navigation bar (P-74).
 */
function formAddons(doc: IRDocument, deckDir: string): string[] {
  const { renderers } = doc.config
  if (Object.keys(renderers).length > 0 && !renderers.web) return []
  const name = typeof renderers.web?.package === 'string' ? renderers.web.package : WEB_PACKAGE
  return installed(name, deckDir) ? [name] : []
}

function slide(section: IRSection, head: Record<string, unknown>, options: SlidevOptions): string {
  const frontmatter = { ...head, ...section.hints.slides }
  const notes: IRBlock[] = []
  const parts = section.title ? [markdown({ type: 'heading', depth: 1, children: [{ type: 'text', value: section.title }] })] : []
  parts.push(...blocks(section.blocks, options, notes))
  if (notes.length > 0) parts.push(`<!--\n${notesText(notes, options)}\n-->`)
  const open = Object.keys(frontmatter).length > 0 ? `---\n${stringify(frontmatter).trim()}\n---` : '---'
  return `${open}\n\n${parts.join('\n\n')}\n`
}

/** The visual blocks as Slidev Markdown; narration blocks are collected into `notes`. */
function blocks(list: IRBlock[], options: SlidevOptions, notes: IRBlock[]): string[] {
  const out: string[] = []
  for (const block of list) {
    if (block.role === 'narration') notes.push(block)
    else out.push(visual(block, options, notes))
  }
  return out
}

function visual(block: IRBlock, options: SlidevOptions, notes: IRBlock[]): string {
  const { node } = block
  if (node.type === 'markdown' && node.reveal === 'items') {
    // Item k at step at + k. Slidev reads an absolute click 0 as "the next click", so a list
    // whose first item shows from the start is placed relatively: our other clicks are absolute.
    return `<v-clicks at="${block.at === 0 ? '+0' : block.at}">\n\n${markdown(node.mdast, urls(block, options))}\n\n</v-clicks>`
  }
  const content = node.type === 'markdown' ? markdown(node.mdast, urls(block, options))
    : node.type === 'code' ? code(node, block.at)
    : scoped(component(node, block, options, notes), block.at)
  if (block.at === 0 && block.until === undefined) return content
  const click = block.until === undefined ? `v-click="${block.at}"`
    : block.at === 0 ? `v-click.hide="${block.until}"`
    : `v-click="[${block.at}, ${block.until}]"`
  return `<div ${click}>\n\n${content}\n\n</div>`
}

/**
 * A component counts its internal steps from its block's `at` (docs/ir.md 2.4),
 * as in the viewer, which gives every block its `at`: a deck's own component too.
 */
function scoped(content: string, at: number): string {
  return at > 0 ? `<PmStepScope :at="${at}">\n\n${content}\n\n</PmStepScope>` : content
}

/** What the code reference plugin records besides the IR's own fields (see @presmium/slidev-addon-code). */
type Origin = CodeOrigin
type Variant = CodeVariant

const STATUS: Record<string, string> = { moved: '已移动', fuzzy: '待确认', lost: '已失效' }

function link(className: string, href: string | undefined, text: string, attrs = ''): string {
  return href
    ? `<a class="${className}" href="${escapeHtml(href)}" target="_blank" rel="noopener"${attrs}>${escapeHtml(text)}</a>`
    : `<span class="${className}"${attrs}>${escapeHtml(text)}</span>`
}

/**
 * Where the code comes from (`CodeNode.origin`), above the code: file and
 * lines linked to the repository (the link stays in exported PDFs), the
 * pinned commit or the commit of each version (the one on screen marked,
 * from `$clicks`), and whether pinned code drifted or the anchor moved. The
 * web form shows the same bar. One HTML block: no blank line inside.
 */
function originBar(node: CodeNode, at: number): string {
  const origin = node.origin as Origin | undefined
  if (!origin) return ''
  const lines = origin.endLine > origin.startLine ? `${origin.startLine}-${origin.endLine}` : `${origin.startLine}`
  const title = ` title="${escapeHtml(origin.permalink ? `在仓库中打开 ${origin.file}` : origin.anchor)}"`
  const variants = (node.variants ?? []) as Variant[]
  // Version k is on screen from step at + k (the first one from the start) until the next.
  const shown = `Math.min(Math.max($clicks - ${at}, 0), ${variants.length - 1})`
  const commits = variants.length
    ? variants.map((variant, k) => link('pm-code-origin__variant', variant.permalink, variant.label, ` :data-active="${shown} === ${k} ? '' : undefined"`))
    : [`<span class="pm-code-origin__commit"${origin.pin ? ` title="${origin.pin}"` : ''}>${origin.pin ? `@ ${origin.pin.slice(0, 7)}` : '工作区'}</span>`]
  const badge = STATUS[origin.status]
    ? `<span class="pm-code-origin__badge" data-status="${origin.status}">${STATUS[origin.status]}</span>`
    : origin.pin && !variants.length && origin.drift
      ? `<span class="pm-code-origin__badge" data-drift="${origin.drift}">${origin.drift === 'drifted' ? '已漂移' : '已锁定'}</span>`
      : ''
  const file = link('pm-code-origin__file', origin.permalink, `${node.title ?? origin.file}:${lines}`, title)
  return `<div class="pm-code-origin" data-anchor="${escapeHtml(origin.anchor)}">\n${[file, ...commits, badge].filter(Boolean).join('\n')}\n</div>`
}

/** A code block; `highlight` steps through its line sets, `variants` morph with Shiki Magic Move. */
function code(node: CodeNode, at: number): string {
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
  const outputs = (node.outputs ?? []).map(run => [run.stdout, run.stderr].filter(Boolean).join('\n').replace(/\n$/, '')).filter(Boolean)
  return [originBar(node, at), out, ...outputs.map(text => `<div class="pm-output">\n\n${fence('text', text, '')}\n\n</div>`)].filter(Boolean).join('\n\n')
}

/**
 * A plugin component: the plugin's Slidev extension when it has one, else the
 * component tag (plugins are addons, so Slidev registers their components).
 * A component no plugin provides degrades to its `fallback` (docs/ir.md section 6).
 */
function component(node: ComponentNode, block: IRBlock, options: SlidevOptions, notes: IRBlock[]): string {
  const extension = extensionFor(node, options.extensions)
  if (extension) return String(extension(node, block))
  if (!node.plugin) return node.fallback ? markdown(node.fallback, urls(block, options)) : `> 组件 ${node.name} 只能在网页中查看。`
  const attrs = Object.entries(node.props).map(([name, value]) => typeof value === 'string'
    ? ` ${name}="${escapeHtml(value).replace(/\n/g, '&#10;')}"`
    // A Vue expression in single quotes: JSON with `'` and `&` escaped stays valid JavaScript.
    : ` :${name}='${JSON.stringify(value).replace(/'/g, '\\u0027').replace(/&/g, '\\u0026')}'`).join('')
  const children = node.children ? blocks(node.children, options, notes) : []
  return children.length > 0 ? `<${node.name}${attrs}>\n\n${children.join('\n\n')}\n\n</${node.name}>` : `<${node.name}${attrs} />`
}

/**
 * Notes in step order. `[click:n]` moves the highlight n clicks on from the
 * previous marker, so the narration of step s is highlighted from step s.
 */
function notesText(notes: IRBlock[], options: SlidevOptions): string {
  let step = 0
  return [...notes].sort((a, b) => a.at - b.at).map((block) => {
    const { node } = block
    let text = node.type === 'markdown' ? markdown(node.mdast, urls(block, options))
      : node.type === 'code' ? fence(node.lang, node.value, '')
      : node.fallback ? markdown(node.fallback) : ''
    if (block.at > step) {
      // A marker opens a paragraph; before any other block it stands as a paragraph of its own.
      const marker = block.at - step === 1 ? '[click]' : `[click:${block.at - step}]`
      text = node.type === 'markdown' && node.mdast.children?.[0]?.type === 'paragraph' ? `${marker} ${text}` : `${marker}\n\n${text}`
      step = block.at
    }
    return text
  }).join('\n\n').replace(/-->/g, '--&gt;')
}

/** Relative image URLs point into the source directory of the block. */
function urls(block: IRBlock, options: SlidevOptions): (url: string) => string {
  return url => /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(url) ? url : relativeTo(options.dir, resolve(dirname(block.source.file), url))
}

function relativeTo(dir: string, path: string): string {
  const rel = relative(dir, path)
  return rel.startsWith('.') ? rel : `./${rel}`
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
