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

const MESSAGES = {
  'zh-CN': {
    webOnly: (name: string) => `组件 ${name} 只能在网页中查看。`,
  },
  'en': {
    webOnly: (name: string) => `The component ${name} can only be viewed on the web.`,
  },
} satisfies Record<Locale, unknown>

type Messages = (typeof MESSAGES)[Locale]

export interface SlidevDeck {
  markdown: string
  assets: Map<string, LocalAsset>
}

interface Generation {
  ctx: RenderContext
  dir: string
  locale: Locale
  t: Messages
  assets: Map<string, LocalAsset>
  files: Set<string>
  links: (label: string) => string | undefined
  section: string
  live: boolean
  chapters: Map<string, string>
}

const FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#0f5f5c"/></svg>')}`

export function deckLang(doc: IRDocument): string {
  return typeof doc.meta.lang === 'string' && doc.meta.lang ? doc.meta.lang : DEFAULT_LANG
}

const RENDERER_KEYS = new Set(['package', 'base', 'port', 'liveCode'])

const WEB_PACKAGE = '@presmium/web'

const THEME_DIR = fileURLToPath(new URL('../../theme', import.meta.url))

export function slidevMarkdown(doc: IRDocument, ctx: RenderContext, dir: string): SlidevDeck {
  const locale = deckLocale(ctx.lang ?? deckLang(doc))
  const generation: Generation = { ctx, dir, locale, t: MESSAGES[locale], assets: new Map(), files: new Set(), links: slideLinks(doc), section: '', live: ctx.config.liveCode !== false, chapters: chapters(doc) }
  const markdown = doc.sections.map((section, i) => slide(section, i === 0 ? headmatter(doc, generation) : {}, generation)).join('\n')
  return { markdown, assets: generation.assets }
}

export function hasExtension(node: ComponentNode, extensions: RenderContext['extensions']): boolean {
  return extensions.some(e => (!node.plugin || e.plugin === node.plugin) && e.components?.[node.name])
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

function headmatter(doc: IRDocument, gen: Generation): Record<string, unknown> {
  const { ctx } = gen
  const { theme, ...rest } = Object.fromEntries(Object.entries(ctx.config).filter(([key]) => !RENDERER_KEYS.has(key) && key !== 'addons'))
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
    mcp: false,
    ...ctx.server || ctx.preview ? { presmiumServer: true } : {},
    ...ctx.preview ? { presmiumDocument: previewDocument(ctx) } : {},
    ...doc.config.execute?.environments ? { presmiumEnvironments: ctx.portable(doc.config.execute.environments, gen.dir) } : {},
    ...runnerOptions(doc, gen),
  }
}

export function previewDocument(ctx: RenderContext): string {
  return relative(ctx.workspaceRoot, ctx.deckDir).split('\\').join('/')
}

function addonNames(doc: IRDocument, ctx: RenderContext): string[] {
  const { addons } = ctx.config
  const plugins = doc.config.plugins.filter(name => ctx.pluginDirs[name] !== undefined)
  const listed = [...plugins, ...Array.isArray(addons) ? addons : [], ...formAddons(doc, ctx)]
  return listed.filter((name): name is string => typeof name === 'string')
}

export function addonDirs(doc: IRDocument, ctx: RenderContext): string[] {
  return addonNames(doc, ctx).flatMap(name => ctx.pluginDirs[name] ?? packageDir(name, ctx.deckDir) ?? [])
}

function addonPath(name: string, gen: Generation): string {
  const dir = gen.ctx.pluginDirs[name] ?? packageDir(name, gen.ctx.deckDir)
  return dir ? relativePath(dirname(gen.dir), dir) : name
}

function relativePath(from: string, dir: string): string {
  const path = relative(from, dir).split('\\').join('/')
  return path.startsWith('.') ? path : `./${path}`
}

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

function formAddons(doc: IRDocument, ctx: RenderContext): string[] {
  const { renderers } = doc.config
  if (Object.keys(renderers).length > 0 && !renderers.web) return []
  const name = typeof renderers.web?.package === 'string' ? renderers.web.package : WEB_PACKAGE
  return packageDir(name, ctx.deckDir) ? [name] : []
}

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
  const key = owned ? ` key="${escapeHtml(block.id)}"` : ''
  const wrap = (content: string) => (owned || unanchored(block) ? content : `<div class="pm-block" data-block="${escapeHtml(block.id)}" data-section="${escapeHtml(gen.section)}" data-step="${block.at}">\n\n${content}\n\n</div>`)
  if (node.type === 'markdown' && node.reveal === 'items') {
    return wrap(`<v-clicks at="${block.at === 0 ? '+0' : block.at}"${key}>\n\n${md(node.mdast, block, gen)}\n\n</v-clicks>`)
  }
  const content = node.type === 'markdown' ? md(node.mdast, block, gen)
    : node.type === 'code' ? code(node, block, gen, owned)
    : scoped(component(node, block, gen, notes), block.at)
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

function md(tree: MdastNode, block: IRBlock | undefined, gen: Generation, notes = false): string {
  const { mdast } = lowerMyst(buttons(verbatim(gen.ctx.preview && !notes ? authorMarks(tree) : tree)), {
    footnotes: 'gfm',
    iframes: 'element',
    cards: 'element',
    links: notes ? undefined : gen.links,
    urls: block ? (url, type) => asset(url, block, gen, type, notes) : undefined,
    htmlUrls: true,
    roles: notes ? 'marks' : 'children',
  })
  return markdown(slidevNodes(mdast, gen))
}

function authorMarks(node: MdastNode): MdastNode {
  if (node.type === 'presmiumRole' && !node.children?.length) return { type: 'html', value: `<span class="pm-role-mark" data-mark="${escapeHtml(roleMark(node))}"></span>` }
  return node.children ? { ...node, children: node.children.map(authorMarks) } : node
}

function verbatim(node: MdastNode): MdastNode {
  if (node.type === 'text' && node.value?.includes('{{')) {
    return { type: 'html', value: `<span v-pre>${escapeHtml(node.value.replace(/[\\`*_[\]$~|]/g, '\\$&'))}</span>` }
  }
  return node.children ? { ...node, children: node.children.map(verbatim) } : node
}

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

function asset(url: string, block: IRBlock, gen: Generation, type: LinkedType | 'prop', notes = false): string | undefined {
  const found = gen.ctx.localAsset(block.source, url)
  if (!found) return undefined
  gen.assets.set(found.name, found)
  if (type === 'image' && !notes) return publishedUrl(found, url, { prefix: '/' })
  const published = publishedUrl(found, url, { prefix: gen.ctx.base })
  if (type === 'link') gen.files.add(published)
  return published
}

function scoped(content: string, at: number): string {
  return at > 0 ? `<PmStepScope :at="${at}">\n\n${content}\n\n</PmStepScope>` : content
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

function originBar(node: CodeNode, at: number, locale: Locale): string {
  const bar = node.origin && originParts(node, undefined, locale)
  if (!bar) return ''
  const variants = node.variants ?? []
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

const runnerLang = (lang: string): string | undefined => Object.hasOwn(RUNNER_LANGS, languageId(lang)) ? RUNNER_LANGS[languageId(lang)] : undefined
const INLINE_IMAGE = 16_384
const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }

const joined = (value: unknown): string => (Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : JSON.stringify(value, null, 2))
// eslint-disable-next-line no-control-regex
const plain = (text: string) => text.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '')

function imageUrl(type: string, base64: string, gen: Generation): string {
  if (base64.length <= INLINE_IMAGE) return `data:${type};base64,${base64}`
  const data = Buffer.from(base64, 'base64')
  const hash = createHash('sha256').update(data).digest('hex')
  const name = `${hash.slice(0, 8)}-output.${IMAGE_TYPES[type]}`
  const file = join(gen.ctx.workDir, 'outputs', `${hash}.${IMAGE_TYPES[type]}`)
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
  }
  gen.assets.set(name, { file, name })
  return `${gen.ctx.base}${name}`
}

function markdownOutput(text: string, block: IRBlock, gen: Generation): string {
  const literal = (node: MdastNode): MdastNode => node.type === 'html' ? { type: 'text', value: String(node.value ?? '') } : node.children ? { ...node, children: node.children.map(literal) } : node
  return md(literal(fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as unknown as MdastNode), block, gen)
}

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

const runnerKey = (section: string, block: string) => `${section}/${block}`

function runsLive(node: CodeNode, gen: Generation): boolean {
  return Boolean(gen.live && node.run && node.run.when !== 'compile' && node.echo !== false && !node.variants?.length && !node.highlight?.length && runnerLang(node.lang))
}

function importedPackages(code: string): string[] {
  const names = [...code.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*(['"])([^'"\n]+)\1/g)].map(match => match[2]!)
  return names
    .filter(name => !/^[./]/.test(name) && !name.includes(':'))
    .map(name => name.split('/').slice(0, name.startsWith('@') ? 2 : 1).join('/'))
}

function typesSource(doc: IRDocument, gen: Generation): Record<string, unknown> {
  const scripts = doc.sections.flatMap(section => section.blocks).map(block => block.node)
    .filter((node): node is CodeNode => node.type === 'code' && runsLive(node, gen) && ['javascript', 'typescript'].includes(runnerLang(node.lang)!))
  return scripts.some(node => importedPackages(node.value).some(name => !packageDir(name, gen.dir))) ? { monacoTypesSource: 'none' } : {}
}

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

function monacoRun(node: CodeNode, block: IRBlock, gen: Generation): string {
  const options = `runnerOptions:$slidev.configs.presmiumRuns['${runnerKey(gen.section, block.id).replace(/['\\]/g, '\\$&')}']`
  return fence(runnerLang(node.lang)!, node.value, ` {monaco-run} {autorun:'once',height:'auto',${options}}`)
}

function code(node: CodeNode, block: IRBlock, gen: Generation, owned: boolean): string {
  const at = block.at
  const stages = (sets: number[][]) => `{${sets.map(lineRanges).join('|')}}${sets.length > 1 ? `{at:${at + 1}}` : ''}`
  const title = (label?: string) => label ? ` [${label}]` : ''
  let out: string
  if (node.echo === false) {
    const runs = node.outputs ?? []
    const prose = runs.length > 0 && runs.every(r => r.outputs?.length && r.outputs.every(o => o.output_type !== 'stream' && o.output_type !== 'error' && o.data['text/markdown'] !== undefined))
    return runs.map(run => output(run, block, gen, prose)).filter(Boolean).join('\n\n')
  } else if (!owned && runsLive(node, gen)) {
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

function published(node: ComponentNode, block: IRBlock, gen: Generation): ComponentNode {
  if (!node.assets) return node
  let props = node.props
  for (const [path, url] of Object.entries(node.assets)) props = withProp(props, path, asset(url, block, gen, 'prop') ?? url)
  return { ...node, props }
}

function empty(fallback: MdastNode | undefined): boolean {
  return !fallback || (fallback.type === 'root' && !fallback.children?.length)
}

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
  const content = empty(node.fallback) && (node.layer === 'overlay' || !node.fallback)
    ? live
    : `<PmStaticFallback>\n\n${live}\n\n<template v-slot:fallback>\n\n${md(unfolded(node.fallback!), block, gen)}\n\n</template>\n</PmStaticFallback>`
  return `<PmBoundary name="${escapeHtml(node.name)}">\n\n${content}\n\n</PmBoundary>`
}

function unfolded(node: MdastNode): MdastNode {
  if (node.type === 'html' && typeof node.value === 'string') return { ...node, value: node.value.replace(/<details(?=[^>]*\sdata-static="open")/g, '<details open') }
  return node.children ? { ...node, children: node.children.map(unfolded) } : node
}

function tag(node: ComponentNode, gen: Generation, notes: IRBlock[]): string {
  const attrs = Object.entries(node.props).map(([name, value]) => typeof value === 'string' && !node.assets?.[name]
    ? ` ${name}="${escapeHtml(value).replace(/\n/g, '&#10;')}"`
    : ` :${name}='${JSON.stringify(value).replace(/'/g, '\\u0027').replace(/&/g, '\\u0026')}'`).join('')
  const children = node.children ? blocks(node.children, gen, notes, true) : []
  return children.length > 0 ? `<${node.name}${attrs}>\n\n${children.join('\n\n')}\n\n</${node.name}>` : `<${node.name}${attrs} />`
}

function notesText(notes: IRBlock[], gen: Generation): string {
  let step = 0
  return [...notes].sort((a, b) => a.at - b.at).map((block) => {
    const { node } = block
    let text = node.type === 'markdown' ? md(node.mdast, block, gen, true)
      : node.type === 'code' ? fence(node.lang, node.value, '')
      : node.fallback ? md(node.fallback, block, gen, true) : ''
    if (block.at > step) {
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
