import type { Compilation } from '@lincyaw/compiler'
import { CompletionItemKind, MarkupKind } from 'vscode-languageserver/node'
import type { CompletionItem, Position } from 'vscode-languageserver/node'
import { anchorAt, optionsOf, typingAt } from '../domain/index.ts'
import type { DirectiveInfo, Fence } from '../domain/index.ts'
import { anchorCompletion, unitNames } from './anchors.ts'
import { deckSyntax } from './syntax.ts'
import type { DeckSyntax } from './syntax.ts'

function describe(info: DirectiveInfo, syntax: DeckSyntax): string {
  const options = Object.keys(optionsOf(info, syntax.common)).map(name => `\`:${name}:\``).join(', ')
  return [info.doc, `${syntax.t.options}: ${options}`].filter(Boolean).join('\n\n')
}

function isAnchorArgument(fence: Fence, prefix: string, compilation: Compilation, syntax: DeckSyntax): boolean {
  return syntax.anchors.has(fence.name) || compilation.resolvers.schemes().some(scheme => prefix.startsWith(`${scheme}:`))
}

export async function complete(compilation: Compilation, lines: string[], position: Position): Promise<CompletionItem[]> {
  const typing = typingAt(lines, position.line, position.character)
  if (!typing) return []
  const { line, character } = position
  const edit = (newText: string) => ({ range: { start: { line, character: typing.start }, end: { line, character } }, newText })
  const syntax = deckSyntax(compilation)
  const infos = syntax.directives

  switch (typing.kind) {
    case 'directive':
      return [...infos.values()].map(info => ({
        label: info.name,
        kind: CompletionItemKind.Keyword,
        detail: info.source,
        documentation: { kind: MarkupKind.Markdown, value: describe(info, syntax) },
        textEdit: edit(typing.closed ? info.name : `${info.name}}`),
      }))

    case 'argument': {
      if (typing.fence.name === 'component') {
        return [...compilation.components].map(([name, plugin]) => ({ label: name, kind: CompletionItemKind.Class, detail: plugin, textEdit: edit(name) }))
      }
      if (!isAnchorArgument(typing.fence, typing.prefix, compilation, syntax)) return []
      return anchorCompletion(compilation, typing.prefix, line, typing.start, character, syntax.t)
    }

    case 'option': {
      const info = infos.get(typing.fence.name)
      if (!info) return []
      return Object.entries(optionsOf(info, syntax.common)).filter(([name]) => !typing.written.includes(name)).map(([name, option]) => ({
        label: name,
        kind: CompletionItemKind.Property,
        detail: option.type,
        documentation: option.doc,
        textEdit: edit(`${name}: `),
      }))
    }

    case 'value': {
      const info = infos.get(typing.fence.name)
      const values = [...(info && optionsOf(info, syntax.common)[typing.option]?.values) ?? []]
      if (typing.option === 'executor') values.push(...compilation.plugins.flatMap(({ plugin }) => plugin?.executors?.map(e => e.id) ?? []))
      const anchor = typing.option === 'steps' ? anchorAt(lines, typing.fence.line, compilation.resolvers.schemes(), syntax.anchors) : undefined
      if (anchor) values.push(...await unitNames(compilation, anchor.anchor), 'all', 'none')
      return [...new Set(values)].map(value => ({ label: value, kind: CompletionItemKind.Value, textEdit: edit(value) }))
    }
  }
}
