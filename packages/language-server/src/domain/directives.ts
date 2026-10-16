/**
 * The directives a deck accepts, for completion: the compiler's built-in
 * directives (docs/ir.md section 5.1) and those of the deck's plugins, with
 * their options. Directives whose argument is an anchor (`arg: 'anchor'`)
 * are known by their specs.
 */
import type { DirectiveOptionType, DirectiveSpec } from '@presmium/kernel'

export interface OptionInfo {
  type?: DirectiveOptionType
  doc?: string
  /** Values to offer. */
  values?: string[]
}

export interface DirectiveInfo {
  name: string
  /** The built-in label, or the id of the plugin that provides it. */
  source: string
  doc?: string
  /** Options besides the common ones. */
  options: Record<string, OptionInfo>
  /** Its argument is an anchor (`scheme:target`). */
  anchor?: boolean
}

/**
 * The built-in directives followed by the plugins' directives. A plugin's
 * `:run:` option is described as `run` describes the built-in one.
 */
export function directiveInfos(builtin: readonly DirectiveInfo[], plugins: { plugin: string, directives: readonly DirectiveSpec[] }[], run?: OptionInfo): Map<string, DirectiveInfo> {
  const infos = new Map(builtin.map(info => [info.name, info]))
  for (const { plugin, directives } of plugins) {
    for (const spec of directives) {
      if (infos.has(spec.name)) continue
      const options = Object.fromEntries(Object.entries(spec.options ?? {}).map(([name, type]): [string, OptionInfo] => [name, name === 'run' && run ? { ...run, type } : { type }]))
      infos.set(spec.name, { name: spec.name, source: plugin, options, ...spec.arg === 'anchor' ? { anchor: true } : {} })
    }
  }
  return infos
}

/** Every option of a directive, the common ones first. */
export function optionsOf(info: DirectiveInfo, common: Record<string, OptionInfo>): Record<string, OptionInfo> {
  return { ...common, ...info.options }
}

/** Names of the directives whose argument is an anchor. */
export function anchorDirectives(infos: Map<string, DirectiveInfo>): Set<string> {
  return new Set([...infos.values()].filter(info => info.anchor).map(info => info.name))
}
