/**
 * Completion in a deck's source: directive names after `{`, the options of
 * a directive and some of their values, component names, and anchors with
 * their logical units (`:steps:`).
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Compilation } from '@presmium/compiler'
import { CompletionItemKind, MarkupKind } from 'vscode-languageserver/node'
import type { CompletionItem, Position } from 'vscode-languageserver/node'
import { ANCHOR_DIRECTIVES, anchorAt, directiveInfos, optionsOf, typingAt } from '../domain/index.ts'
import type { DirectiveInfo, Fence } from '../domain/index.ts'
import { anchorCompletion, unitNames } from './anchors.ts'

function directives(compilation: Compilation): Map<string, DirectiveInfo> {
  return directiveInfos(compilation.plugins.flatMap(({ plugin }) => plugin ? [{ plugin: plugin.id, directives: plugin.directives ?? [] }] : []))
}

function describe(info: DirectiveInfo): string {
  const options = Object.keys(optionsOf(info)).map(name => `\`:${name}:\``).join(', ')
  return [info.doc, `Options: ${options}`].filter(Boolean).join('\n\n')
}

/** Vue components the deck's plugins register (`components/*.vue`), as the compiler finds them. */
async function components(compilation: Compilation): Promise<{ name: string, plugin: string }[]> {
  const found = await Promise.all(compilation.plugins.map(async ({ name, dir, plugin }) => {
    const files = await readdir(join(dir, 'components')).catch(() => [])
    return files.filter(f => f.endsWith('.vue')).map(f => ({ name: f.slice(0, -'.vue'.length), plugin: plugin?.id ?? name }))
  }))
  return found.flat()
}

function isAnchorArgument(fence: Fence, prefix: string, compilation: Compilation): boolean {
  return ANCHOR_DIRECTIVES.has(fence.name) || compilation.resolvers.schemes().some(scheme => prefix.startsWith(`${scheme}:`))
}

export async function complete(compilation: Compilation, lines: string[], position: Position): Promise<CompletionItem[]> {
  const typing = typingAt(lines, position.line, position.character)
  if (!typing) return []
  const { line, character } = position
  const edit = (newText: string) => ({ range: { start: { line, character: typing.start }, end: { line, character } }, newText })
  const infos = directives(compilation)

  switch (typing.kind) {
    case 'directive':
      return [...infos.values()].map(info => ({
        label: info.name,
        kind: CompletionItemKind.Keyword,
        detail: info.source,
        documentation: { kind: MarkupKind.Markdown, value: describe(info) },
        textEdit: edit(typing.closed ? info.name : `${info.name}}`),
      }))

    case 'argument': {
      if (typing.fence.name === 'component') {
        return (await components(compilation)).map(({ name, plugin }) => ({ label: name, kind: CompletionItemKind.Class, detail: plugin, textEdit: edit(name) }))
      }
      if (!isAnchorArgument(typing.fence, typing.prefix, compilation)) return []
      return anchorCompletion(compilation, typing.prefix, line, typing.start, character)
    }

    case 'option': {
      const info = infos.get(typing.fence.name)
      if (!info) return []
      return Object.entries(optionsOf(info)).filter(([name]) => !typing.written.includes(name)).map(([name, option]) => ({
        label: name,
        kind: CompletionItemKind.Property,
        detail: option.type,
        documentation: option.doc,
        textEdit: edit(`${name}: `),
      }))
    }

    case 'value': {
      const info = infos.get(typing.fence.name)
      const values = [...(info && optionsOf(info)[typing.option]?.values) ?? []]
      if (typing.option === 'executor') values.push(...compilation.plugins.flatMap(({ plugin }) => plugin?.executors?.map(e => e.id) ?? []))
      const anchor = typing.option === 'steps' ? anchorAt(lines, typing.fence.line, compilation.resolvers.schemes()) : undefined
      if (anchor) values.push(...await unitNames(compilation, anchor.anchor), 'all', 'none')
      return [...new Set(values)].map(value => ({ label: value, kind: CompletionItemKind.Value, textEdit: edit(value) }))
    }
  }
}
