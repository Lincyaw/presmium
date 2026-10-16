/**
 * What the deck of a compilation accepts and says, for the editor: its
 * directives with their options (from the compiler's built-in directives and
 * the plugins' specs), the directives whose argument is an anchor, and the
 * messages in the deck's language.
 */
import { BUILTIN_DIRECTIVE_INFO, COMMON_DIRECTIVE_OPTIONS, RUN_OPTION } from '@presmium/compiler'
import type { Compilation, DirectiveOptionInfo } from '@presmium/compiler'
import { deckLocale } from '@presmium/kernel'
import type { Locale } from '@presmium/kernel'
import { anchorDirectives, directiveInfos, LS_MESSAGES } from '../domain/index.ts'
import type { DirectiveInfo, LsMessages, OptionInfo } from '../domain/index.ts'

export interface DeckSyntax {
  directives: Map<string, DirectiveInfo>
  /** Options every directive accepts. */
  common: Record<string, OptionInfo>
  /** Directives whose argument is an anchor. */
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
