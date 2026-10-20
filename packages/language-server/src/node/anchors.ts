import { readdir } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Compilation } from '@lincyaw/compiler'
import { isRenderable } from '@lincyaw/kernel'
import type { AnchorString, CodeNode, Resolution, ResolvedLocation } from '@lincyaw/kernel'
import { CompletionItemKind, MarkupKind } from 'vscode-languageserver/node'
import type { CompletionItem, Hover, Location, Range } from 'vscode-languageserver/node'
import { blockAt, declarationNames, regionNames } from '../domain/index.ts'
import type { AnchorRef, LsMessages } from '../domain/index.ts'

const MAX_NAMES = 200
const MAX_LINES = 60

const suggest = (t: LsMessages) => ({ title: t.suggest, command: 'editor.action.triggerSuggest' })

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

export async function anchorDefinition(compilation: Compilation, ref: AnchorRef): Promise<Location[]> {
  const resolution = await resolveAnchor(compilation, ref.anchor)
  const found = resolution.location ? [resolution.location] : resolution.candidates ?? []
  return found.map(location => locationOf(compilation, location))
}

function fenced(t: LsMessages, text: string, lang = ''): string {
  const lines = text.replace(/\n+$/, '').split('\n')
  const shown = lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), t.moreLines(lines.length - MAX_LINES)] : lines
  const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1)))
  return `${fence}${lang}\n${shown.join('\n')}\n${fence}`
}

function where(file: string, startLine: number, endLine: number): string {
  return `\`${file}:${startLine}-${endLine}\``
}

export async function anchorHover(compilation: Compilation, file: string, ref: AnchorRef, t: LsMessages): Promise<Hover> {
  const range: Range = { start: { line: ref.line, character: ref.start }, end: { line: ref.line, character: ref.end } }
  const block = blockAt(compilation.doc, file, ref.line + 1)
  const node = block?.node.type === 'code' && block.node.origin?.anchor === ref.anchor ? block.node : undefined
  const parts = node?.origin && node.origin.startLine > 0 ? codeNodeHover(node, t) : await resolvedHover(compilation, ref, t)
  return { contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') }, range }
}

function codeNodeHover(node: CodeNode, t: LsMessages): string[] {
  const origin = node.origin!
  const notes = [t.status[origin.status] ?? origin.status, origin.pin && t.pinnedAt(origin.pin.slice(0, 7)), origin.drift === 'drifted' && t.drifted].filter(Boolean)
  const parts = [`**${origin.anchor}** ${where(origin.file, origin.startLine, origin.endLine)} (${notes.join(', ')})`, fenced(t, node.value, node.lang)]
  const run = node.outputs?.[0]
  if (run) {
    const status = run.timedOut ? t.timedOut : run.ok ? `${run.durationMs} ms` : t.exitCode(run.exitCode)
    parts.push(`**${t.recordedOutput}** (${run.executorId}, ${status})`, fenced(t, [run.stdout, run.stderr].filter(Boolean).join('\n') || t.noOutput))
  } else if (node.run) {
    parts.push(node.run.when === 'live' ? t.runsLive : t.notRecorded)
  }
  return parts
}

async function resolvedHover(compilation: Compilation, ref: AnchorRef, t: LsMessages): Promise<string[]> {
  const resolution = await resolveAnchor(compilation, ref.anchor)
  const { location } = resolution
  const parts = [[`**${ref.anchor}**`, location && where(location.file, location.startLine, location.endLine), `(${t.status[resolution.status] ?? resolution.status})`].filter(Boolean).join(' ')]
  if (resolution.message) parts.push(resolution.message)
  if (location && isRenderable(resolution)) parts.push(fenced(t, location.text, /\.([\w-]+)$/.exec(location.file)?.[1] ?? ''))
  return parts
}

export async function anchorCompletion(compilation: Compilation, prefix: string, line: number, start: number, end: number, t: LsMessages): Promise<CompletionItem[]> {
  const edit = (from: number, newText: string) => ({ range: { start: { line, character: from }, end: { line, character: end } }, newText })
  const colon = prefix.indexOf(':')
  if (colon < 0) {
    return compilation.resolvers.schemes().map(scheme => ({ label: `${scheme}:`, kind: CompletionItemKind.Keyword, detail: t.anchorScheme, textEdit: edit(start, `${scheme}:`), command: suggest(t) }))
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
      return { label: name, kind: entry.isDirectory() ? CompletionItemKind.Folder : CompletionItemKind.File, textEdit: edit(start + colon + 1 + dir.length, name), command: suggest(t) }
    })
  }

  const file = target.slice(0, hash)
  const text = await compilation.src.read(file)
  if (text === undefined) return []
  const typed = target.slice(hash + 1).toLowerCase()
  const harvested = (scheme === 'region' ? regionNames(text) : scheme === 'symbol' ? declarationNames(text) : [...regionNames(text), ...declarationNames(text)])
    .filter(name => name.toLowerCase().includes(typed))
  const resolved = await Promise.all(harvested.slice(0, MAX_NAMES).map(async (name) => {
    const resolution = await compilation.resolvers.resolve(`${scheme}:${file}#${name}`, compilation.src)
    return isRenderable(resolution) ? { name, location: resolution.location! } : undefined
  }))
  return resolved.filter(found => found !== undefined).map(({ name, location }) => ({
    label: name,
    kind: scheme === 'region' ? CompletionItemKind.Reference : CompletionItemKind.Function,
    detail: `${location.file}:${location.startLine}-${location.endLine}`,
    documentation: { kind: MarkupKind.Markdown, value: fenced(t, location.text) },
    textEdit: edit(start + colon + 1 + hash + 1, name),
  }))
}

export async function unitNames(compilation: Compilation, anchor: AnchorString): Promise<string[]> {
  const resolution = await resolveAnchor(compilation, anchor)
  return resolution.location ? regionNames(resolution.location.text) : []
}
