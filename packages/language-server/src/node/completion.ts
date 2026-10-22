import type { Compilation } from '@lincyaw/compiler'
import { CompletionItemKind, MarkupKind } from 'vscode-languageserver/node'
import type { CompletionItem, Position } from 'vscode-languageserver/node'
import { anchorAt, optionsOf, typingAt } from '../domain/index.ts'
import type { DirectiveHelp, Fence } from '../domain/index.ts'
import { anchorCompletion, unitNames } from './anchors.ts'
import { directiveCatalog } from './directive-catalog.ts'
import type { DirectiveCatalog } from './directive-catalog.ts'

function describe(info: DirectiveHelp, catalog: DirectiveCatalog): string {
  const options = Object.keys(optionsOf(info, catalog.common)).map(name => `\`:${name}:\``).join(', ')
  return [info.doc, `${catalog.t.options}: ${options}`].filter(Boolean).join('\n\n')
}

function isAnchorArgument(fence: Fence, prefix: string, compilation: Compilation, catalog: DirectiveCatalog): boolean {
  return catalog.anchors.has(fence.name) || compilation.resolvers.schemes().some(scheme => prefix.startsWith(`${scheme}:`))
}

export async function complete(compilation: Compilation, lines: string[], position: Position): Promise<CompletionItem[]> {
  const typing = typingAt(lines, position.line, position.character)
  if (!typing) return []
  const { line, character } = position
  const edit = (newText: string) => ({ range: { start: { line, character: typing.start }, end: { line, character } }, newText })
  const catalog = directiveCatalog(compilation)
  const helps = catalog.directives

  switch (typing.kind) {
    case 'directive':
      return [...helps.values()].map(info => ({
        label: info.name,
        kind: CompletionItemKind.Keyword,
        detail: info.source,
        documentation: { kind: MarkupKind.Markdown, value: describe(info, catalog) },
        textEdit: edit(typing.closed ? info.name : `${info.name}}`),
      }))

    case 'argument': {
      if (typing.fence.name === 'component') {
        return [...compilation.components].map(([name, plugin]) => ({ label: name, kind: CompletionItemKind.Class, detail: plugin, textEdit: edit(name) }))
      }
      if (!isAnchorArgument(typing.fence, typing.prefix, compilation, catalog)) return []
      return anchorCompletion(compilation, typing.prefix, line, typing.start, character, catalog.t)
    }

    case 'option': {
      const info = helps.get(typing.fence.name)
      if (!info) return []
      return Object.entries(optionsOf(info, catalog.common)).filter(([name]) => !typing.written.includes(name)).map(([name, option]) => ({
        label: name,
        kind: CompletionItemKind.Property,
        detail: option.type,
        documentation: option.doc,
        textEdit: edit(`${name}: `),
      }))
    }

    case 'value': {
      const info = helps.get(typing.fence.name)
      const values = [...(info && optionsOf(info, catalog.common)[typing.option]?.values) ?? []]
      if (typing.option === 'executor') values.push(...compilation.plugins.flatMap(({ plugin }) => plugin?.executors?.map(e => e.id) ?? []))
      const anchor = typing.option === 'steps' ? anchorAt(lines, typing.fence.line, compilation.resolvers.schemes(), catalog.anchors) : undefined
      if (anchor) values.push(...await unitNames(compilation, anchor.anchor), 'all', 'none')
      return [...new Set(values)].map(value => ({ label: value, kind: CompletionItemKind.Value, textEdit: edit(value) }))
    }
  }
}
