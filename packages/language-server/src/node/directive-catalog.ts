import { BUILTIN_DIRECTIVE_INFO, COMMON_DIRECTIVE_OPTIONS, RUN_OPTION } from '@lincyaw/compiler'
import type { Compilation, DirectiveOptionInfo } from '@lincyaw/compiler'
import { deckLocale } from '@lincyaw/kernel'
import type { Locale } from '@lincyaw/kernel'
import { anchorDirectives, directiveInfos, LS_MESSAGES } from '../domain/index.ts'
import type { DirectiveInfo, LsMessages, OptionInfo } from '../domain/index.ts'

export interface DeckSyntax {
  directives: Map<string, DirectiveInfo>
  common: Record<string, OptionInfo>
  anchors: Set<string>
  t: LsMessages
}

function option(info: DirectiveOptionInfo, locale: Locale): OptionInfo {
  return { ...info.type ? { type: info.type } : {}, ...info.doc ? { doc: info.doc[locale] } : {}, ...info.values ? { values: info.values } : {} }
}

function options(infos: Record<string, DirectiveOptionInfo>, locale: Locale): Record<string, OptionInfo> {
  return Object.fromEntries(Object.entries(infos).map(([name, info]) => [name, option(info, locale)]))
}

export function deckSyntax(compilation: Compilation): DeckSyntax {
  const locale = deckLocale(compilation.doc.meta.lang)
  const t = LS_MESSAGES[locale]
  const builtin = BUILTIN_DIRECTIVE_INFO.map(info => ({ name: info.name, source: t.builtIn, doc: info.doc[locale], options: options(info.options, locale) }))
  const plugins = compilation.plugins.flatMap(({ plugin }) => plugin ? [{ plugin: plugin.id, directives: plugin.directives ?? [] }] : [])
  const directives = directiveInfos(builtin, plugins, option(RUN_OPTION, locale))
  return { directives, common: options(COMMON_DIRECTIVE_OPTIONS, locale), anchors: anchorDirectives(directives), t }
}
