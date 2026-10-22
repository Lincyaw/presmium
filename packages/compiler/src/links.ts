import { execFile, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { ABSOLUTE_URL, htmlAttributes, irBlocks, isRecord } from '@lincyaw/kernel'
import type { Finding, IRBlock, IRDocument, MdastNode, SourcePos } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'
import { publishesDirectory, unpublishedDirectory } from './assets.ts'
import { BUILTIN_DIRECTIVES } from './blocks.ts'
import { parseFrontmatter, Parser } from './parser.ts'
import { plainText, sectionSlug, splitSections } from './sections.ts'
import { lineFinder } from './source-lines.ts'
import type { LineFinder } from './source-lines.ts'
import { viewFor } from './views.ts'

export interface PublishInput {
  doc: IRDocument
  entry: string
  deckDir: string
  workspaceRoot: string
  renderers: string[]
}

const EXTERNAL = /^https?:\/\//i
const URL_ATTRIBUTES = new Set(['href', 'src', 'poster'])
const ID_ATTRIBUTES = new Set(['id', 'name'])
const LINKED = new Set(['link', 'image', 'definition', 'card'])

interface Problem {
  source: SourcePos
  url: string
  message: string
  renderers: string[]
}

export async function checkLinks(input: PublishInput, options: { externalLinks?: boolean } = {}): Promise<Finding[]> {
  const problems = new Map<string, Problem>()
  const external = new Map<string, SourcePos>()
  const documents = new Map<string, Promise<Set<string>>>()
  for (const renderer of input.renderers) {
    const view = viewFor(input.doc, renderer)
    const anchors = documentAnchors(view)
    for (const section of view.sections) {
      for (const block of irBlocks(section.blocks)) {
        for (const url of blockUrls(block)) {
          if (EXTERNAL.test(url)) {
            if (!external.has(url)) external.set(url, block.source)
            continue
          }
          const message = await linkProblem(url, block.source, input, anchors, documents)
          if (!message) continue
          const key = `${block.source.file}\0${block.source.line}\0${url}`
          const known = problems.get(key)
          if (known) known.renderers.push(renderer)
          else problems.set(key, { source: block.source, url, message, renderers: [renderer] })
        }
      }
    }
  }
  const line = lineFinder()
  const findings = [...problems.values()].map(({ source, url, message, renderers }): Finding => ({
    checkId: 'presmium.links',
    severity: 'error',
    message: `${message}${renderers.length < input.renderers.length ? ` (in ${renderers.join(', ')})` : ''}`,
    source: { file: source.file, line: line(source, needles(url)) },
  }))
  if (options.externalLinks) findings.push(...await externalLinks(external, input.entry, line))
  return findings
}

function blockUrls(block: IRBlock): string[] {
  const { node } = block
  const urls: string[] = []
  const walk = (mdast: MdastNode) => {
    if (LINKED.has(mdast.type) && typeof mdast.url === 'string') urls.push(mdast.url)
    if (mdast.type === 'html' && typeof mdast.value === 'string') {
      for (const { value } of htmlAttributes(mdast.value, URL_ATTRIBUTES)) urls.push(value)
    }
    mdast.children?.forEach(walk)
  }
  if (node.type === 'markdown') walk(node.mdast)
  if (node.type === 'component') {
    if (node.fallback) walk(node.fallback)
    for (const url of Object.values(node.assets ?? {})) urls.push(url)
  }
  return urls.map(url => url.trim()).filter(Boolean)
}

async function linkProblem(url: string, source: SourcePos, input: PublishInput, anchors: Set<string>, documents: Map<string, Promise<Set<string>>>): Promise<string | undefined> {
  if (ABSOLUTE_URL.test(url)) return undefined
  const hash = url.indexOf('#')
  const fragment = hash < 0 ? '' : decode(url.slice(hash + 1))
  const path = decode((hash < 0 ? url : url.slice(0, hash)).replace(/\?.*$/s, ''))
  if (!path) return fragment && !anchors.has(fragment) ? `#${fragment} is no section, block, label or heading of the deck` : undefined
  const file = path.startsWith('/') ? join(input.deckDir, 'public', path) : resolve(dirname(source.file), path)
  if (!isInside(file, input.workspaceRoot)) return `${path} lies outside the repository: it cannot be published`
  if (!existsSync(file)) return `${path}: no such file`
  const hidden = publishesDirectory(file, input.deckDir) ? unpublishedDirectory(file, input.deckDir) : undefined
  if (hidden) return `${path}: ${hidden}`
  if (!fragment) return undefined
  const entry = statSync(file).isDirectory() ? join(file, 'lecture.md') : file
  if (extname(entry) !== '.md' || !existsSync(entry)) return undefined
  if (entry === input.entry) return anchors.has(fragment) ? undefined : `${path}#${fragment}: #${fragment} is no section, block, label or heading of the deck`
  if (!documents.has(entry)) documents.set(entry, sourceAnchors(entry))
  return (await documents.get(entry)!).has(fragment) ? undefined : `${path}#${fragment}: no section, block, label or heading of ${relative(input.workspaceRoot, entry).split(sep).join('/')} has the id ${fragment}`
}

function documentAnchors(doc: IRDocument): Set<string> {
  const anchors = new Set<string>()
  for (const section of doc.sections) {
    anchors.add(section.id)
    for (const block of irBlocks(section.blocks)) {
      anchors.add(block.id)
      const { node } = block
      if (node.type === 'markdown') mdastAnchors(node.mdast, anchors)
      if (node.type === 'component' && node.fallback) mdastAnchors(node.fallback, anchors)
    }
  }
  return anchors
}

function mdastAnchors(node: MdastNode, anchors: Set<string>): void {
  for (const key of ['identifier', 'label', 'html_id'] as const) if (typeof node[key] === 'string' && node[key]) anchors.add(node[key] as string)
  if (node.type === 'footnoteDefinition' && typeof node.identifier === 'string') anchors.add(`fn-${node.identifier}`)
  if (node.type === 'heading') anchors.add(sectionSlug(plainText(node)))
  if (node.type === 'mystDirective' && isRecord(node.options) && typeof node.options.label === 'string') anchors.add(node.options.label)
  if (node.type === 'html' && typeof node.value === 'string') {
    for (const { value } of htmlAttributes(node.value, ID_ATTRIBUTES)) if (value) anchors.add(value)
  }
  node.children?.forEach(child => mdastAnchors(child, anchors))
}

async function sourceAnchors(entry: string): Promise<Set<string>> {
  const anchors = new Set<string>()
  try {
    const parser = new Parser(new Map([...BUILTIN_DIRECTIVES]))
    const { children } = await parser.expand(entry)
    const text = readFileSync(entry, 'utf8')
    const headmatter = parseFrontmatter(text)
    const depth = Number.isInteger(headmatter.sectionDepth) && (headmatter.sectionDepth as number) >= 1 ? headmatter.sectionDepth as number : 2
    const title = typeof headmatter.title === 'string' ? headmatter.title : basename(dirname(entry))
    for (const section of splitSections(children, { entry, title, sectionDepth: depth }, () => {})) anchors.add(section.id)
    for (const node of children) mdastAnchors(node, anchors)
  } catch {
  }
  return anchors
}

async function externalLinks(urls: Map<string, SourcePos>, entry: string, line: LineFinder): Promise<Finding[]> {
  if (urls.size === 0) return []
  const at = { file: entry, line: 1 }
  if (spawnSync('lychee', ['--version'], { stdio: 'ignore' }).error) {
    return [{ checkId: 'presmium.links', severity: 'info', message: `lychee is not installed: ${urls.size === 1 ? 'the external link was' : `the ${urls.size} external links were`} not checked (install lychee, https://lychee.cli.rs, to check them)`, source: at }]
  }
  const output = await new Promise<{ stdout: string, error?: Error }>((done) => {
    const child = execFile('lychee', ['--format', 'json', '--no-progress', '-'], { maxBuffer: 64 << 20 }, (error, stdout) => done({ stdout, ...error ? { error } : {} }))
    child.stdin?.on('error', () => {})
    child.stdin?.end(`${[...urls.keys()].join('\n')}\n`)
  })
  let report: unknown
  try {
    report = JSON.parse(output.stdout)
  } catch {
    return [{ checkId: 'presmium.links', severity: 'warning', message: `lychee did not check the external links: ${output.error?.message ?? 'it printed no report'}`, source: at }]
  }
  const failed = isRecord(report) ? [report.fail_map, report.error_map].flatMap(map => (isRecord(map) ? Object.values(map).flat() : [])) : []
  return failed.flatMap((item): Finding[] => {
    if (!isRecord(item) || typeof item.url !== 'string') return []
    const source = urls.get(item.url) ?? urls.get(item.url.replace(/\/$/, '')) ?? at
    const status = isRecord(item.status) && typeof item.status.text === 'string' ? item.status.text : 'failed'
    return [{ checkId: 'presmium.links', severity: 'warning', message: `${item.url}: ${status}`, source: { file: source.file, line: line(source, [item.url]) } }]
  })
}

function needles(url: string): string[] {
  return [...new Set([url, decode(url)])]
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}
