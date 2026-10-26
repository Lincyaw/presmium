import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Compilation } from '@lincyaw/compiler'
import { docBlocks, isRenderable } from '@lincyaw/kernel'
import type { AnchorString, CodeNode, Resolution, ResolvedLocation } from '@lincyaw/kernel'
import { MarkupKind } from 'vscode-languageserver/node'
import type { Hover, Location, Range } from 'vscode-languageserver/node'
import type { LsMessages } from '../domain/index.ts'

const MAX_LINES = 60
export interface AnchorRef { anchor: AnchorString, blockId: string, pin?: string, range: Range }

function resolveAnchor(compilation: Compilation, ref: AnchorRef): Promise<Resolution> {
  return compilation.resolvers.resolve(ref.anchor, compilation.src, compilation.lock.get(ref.anchor), ref.pin)
}
function locationOf(compilation: Compilation, location: ResolvedLocation): Location {
  const last = location.text.split(/\r?\n/).at(-1) ?? ''
  return { uri: pathToFileURL(resolve(compilation.workspaceRoot, location.file)).href,
    range: { start: { line: location.startLine - 1, character: 0 }, end: { line: location.endLine - 1, character: last.length } } }
}
export async function anchorDefinition(compilation: Compilation, ref: AnchorRef): Promise<Location[]> {
  const resolution = await resolveAnchor(compilation, ref)
  return (resolution.location ? [resolution.location] : resolution.candidates ?? []).map(location => locationOf(compilation, location))
}
function fenced(t: LsMessages, text: string, lang = ''): string {
  const lines = text.replace(/\n+$/, '').split('\n')
  const shown = lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), t.moreLines(lines.length - MAX_LINES)] : lines
  const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1)))
  return `${fence}${lang}\n${shown.join('\n')}\n${fence}`
}
function where(file: string, startLine: number, endLine: number): string { return `\`${file}:${startLine}-${endLine}\`` }
export async function anchorHover(compilation: Compilation, ref: AnchorRef, t: LsMessages): Promise<Hover> {
  const block = [...docBlocks(compilation.doc)].find(({ block }) => block.id === ref.blockId)?.block
  const node = block?.node.type === 'code' && block.node.origin?.anchor === ref.anchor && block.node.origin?.pin === ref.pin ? block.node : undefined
  const parts = node?.origin && node.origin.startLine > 0 ? codeNodeHover(node, t) : await resolvedHover(compilation, ref, t)
  return { contents: { kind: MarkupKind.Markdown, value: parts.join('\n\n') }, range: ref.range }
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
  const resolution = await resolveAnchor(compilation, ref)
  const { location } = resolution
  const parts = [[`**${ref.anchor}**`, location && where(location.file, location.startLine, location.endLine), `(${t.status[resolution.status] ?? resolution.status})`].filter(Boolean).join(' ')]
  if (resolution.message) parts.push(resolution.message)
  if (location && isRenderable(resolution)) parts.push(fenced(t, location.text, /\.([\w-]+)$/.exec(location.file)?.[1] ?? ''))
  return parts
}
