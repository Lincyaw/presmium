/**
 * Anchors of `{code-ref}` in the editor: the definition is the code region
 * the deck's resolver finds in the working tree, the hover shows the code and
 * the recorded output of the last compilation, and completion offers the
 * schemes, files and names of an anchor being typed.
 */
import { readdir } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Compilation } from '@presmium/compiler'
import { isRenderable } from '@presmium/kernel'
import type { AnchorString, CodeNode, Resolution, ResolvedLocation } from '@presmium/kernel'
import { CompletionItemKind, MarkupKind } from 'vscode-languageserver/node'
import type { CompletionItem, Hover, Location, Range } from 'vscode-languageserver/node'
import { blockAt, declarationNames, regionNames } from '../domain/index.ts'
import type { AnchorRef } from '../domain/index.ts'

/** Most names checked against the resolver per completion. */
const MAX_NAMES = 200
/** Most lines of code shown in a hover. */
const MAX_LINES = 60

const SUGGEST = { title: 'Suggest', command: 'editor.action.triggerSuggest' }

function resolveAnchor(compilation: Compilation, anchor: AnchorString): Promise<Resolution> {
  return compilation.resolvers.resolve(anchor, compilation.src, compilation.lock.get(anchor))
}

function locationOf(compilation: Compilation, location: ResolvedLocation): Location {
  const last = location.text.split(/\r?\n/).at(-1) ?? ''
  return {
    uri: pathToFileURL(resolve(compilation.workspaceRoot, location.file)).href,
    range: { start: { line: location.startLine - 1, character: 0 }, end: { line: location.endLine - 1, character: last.length } },
  }
}

/** The code region of an anchor in the working tree; the candidates of a fuzzy anchor. */
export async function anchorDefinition(compilation: Compilation, ref: AnchorRef): Promise<Location[]> {
  const resolution = await resolveAnchor(compilation, ref.anchor)
  const found = resolution.location ? [resolution.location] : resolution.candidates ?? []
  return found.map(location => locationOf(compilation, location))
}

/** A fenced code block whose fence is longer than any backtick run in the text. */
function fenced(text: string, lang = ''): string {
  const lines = text.replace(/\n+$/, '').split('\n')
  const shown = lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `… ${lines.length - MAX_LINES} more lines`] : lines
  const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1)))
  return `${fence}${lang}\n${shown.join('\n')}\n${fence}`
}

function where(file: string, startLine: number, endLine: number): string {
  return `\`${file}:${startLine}-${endLine}\``
}

/**
 * The code an anchor shows and the last recorded output. The code node of the
 * last compilation is used when it is at the hovered line (it carries the
 * pinned code and the outputs); else the anchor is resolved in the working tree.
 */
export async function anchorHover(compilation: Compilation, file: string, ref: AnchorRef): Promise<Hover> {
  const range: Range = { start: { line: ref.line, character: ref.start }, end: { line: ref.line, character: ref.end } }
  const block = blockAt(compilation.doc, file, ref.line + 1)
  const node = block?.node.type === 'code' && block.node.origin?.anchor === ref.anchor ? block.node : undefined
  const parts = node?.origin && node.origin.startLine > 0 ? codeNodeHover(node) : await resolvedHover(compilation, ref)
  return { contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') }, range }
}

function codeNodeHover(node: CodeNode): string[] {
  const origin = node.origin!
  const notes = [origin.status, origin.pin && `pinned at ${origin.pin.slice(0, 7)}`, origin.drift === 'drifted' && 'drifted since the pin'].filter(Boolean)
  const parts = [`**${origin.anchor}** ${where(origin.file, origin.startLine, origin.endLine)} (${notes.join(', ')})`, fenced(node.value, node.lang)]
  const run = node.outputs?.[0]
  if (run) {
    const status = run.timedOut ? 'timed out' : run.ok ? `${run.durationMs} ms` : `exit code ${run.exitCode}`
    parts.push(`**Recorded output** (${run.executorId}, ${status})`, fenced([run.stdout, run.stderr].filter(Boolean).join('\n') || '(no output)'))
  } else if (node.run) {
    parts.push(node.run.when === 'live' ? '*Runs in the browser (`:run: live`); no recorded output.*' : '*No recorded output yet.*')
  }
  return parts
}

async function resolvedHover(compilation: Compilation, ref: AnchorRef): Promise<string[]> {
  const resolution = await resolveAnchor(compilation, ref.anchor)
  const { location } = resolution
  const parts = [[`**${ref.anchor}**`, location && where(location.file, location.startLine, location.endLine), `(${resolution.status})`].filter(Boolean).join(' ')]
  if (resolution.message) parts.push(resolution.message)
  if (location && isRenderable(resolution)) parts.push(fenced(location.text, /\.([\w-]+)$/.exec(location.file)?.[1] ?? ''))
  return parts
}

/**
 * Completion of an anchor being typed (`prefix` starts at column `start`):
 * a scheme, then a workspace file, then a name in the file that the scheme's
 * resolver resolves.
 */
export async function anchorCompletion(compilation: Compilation, prefix: string, line: number, start: number, end: number): Promise<CompletionItem[]> {
  const edit = (from: number, newText: string) => ({ range: { start: { line, character: from }, end: { line, character: end } }, newText })
  const colon = prefix.indexOf(':')
  if (colon < 0) {
    return compilation.resolvers.schemes().map(scheme => ({ label: `${scheme}:`, kind: CompletionItemKind.Keyword, detail: 'anchor scheme', textEdit: edit(start, `${scheme}:`), command: SUGGEST }))
  }
  const scheme = prefix.slice(0, colon)
  const target = prefix.slice(colon + 1)
  const hash = target.lastIndexOf('#')

  if (hash < 0) {
    const dir = target.slice(0, target.lastIndexOf('/') + 1)
    const path = resolve(compilation.workspaceRoot, dir)
    const inside = relative(compilation.workspaceRoot, path)
    if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) return []
    const entries = await readdir(path, { withFileTypes: true }).catch(() => [])
    return entries.filter(entry => !entry.name.startsWith('.') && entry.name !== 'node_modules').map((entry) => {
      const name = entry.isDirectory() ? `${entry.name}/` : `${entry.name}#`
      return { label: name, kind: entry.isDirectory() ? CompletionItemKind.Folder : CompletionItemKind.File, textEdit: edit(start + colon + 1 + dir.length, name), command: SUGGEST }
    })
  }

  const file = target.slice(0, hash)
  const text = await compilation.src.read(file)
  if (text === undefined) return []
  const harvested = scheme === 'region' ? regionNames(text) : scheme === 'symbol' ? declarationNames(text) : [...regionNames(text), ...declarationNames(text)]
  const resolved = await Promise.all(harvested.slice(0, MAX_NAMES).map(async (name) => {
    const resolution = await compilation.resolvers.resolve(`${scheme}:${file}#${name}`, compilation.src)
    return isRenderable(resolution) ? { name, location: resolution.location! } : undefined
  }))
  return resolved.filter(found => found !== undefined).map(({ name, location }) => ({
    label: name,
    kind: scheme === 'region' ? CompletionItemKind.Reference : CompletionItemKind.Function,
    detail: `${location.file}:${location.startLine}-${location.endLine}`,
    documentation: { kind: MarkupKind.Markdown, value: fenced(location.text) },
    textEdit: edit(start + colon + 1 + hash + 1, name),
  }))
}

/** Logical units of an anchor for `:steps:`: the regions nested in the code it resolves to. */
export async function unitNames(compilation: Compilation, anchor: AnchorString): Promise<string[]> {
  const resolution = await resolveAnchor(compilation, anchor)
  return resolution.location ? regionNames(resolution.location.text) : []
}
