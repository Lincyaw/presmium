import type { DirectiveOptionType, DirectiveSpec } from '@lincyaw/kernel'

/** What completion and hovers tell about a directive's option. */
export interface OptionHelp {
  type?: DirectiveOptionType
  doc?: string
  values?: string[]
}

/** What completion and hovers tell about a directive. */
export interface DirectiveHelp {
  name: string
  source: string
  doc?: string
  options: Record<string, OptionHelp>
  anchor?: boolean
}

export function directiveHelps(builtin: readonly DirectiveHelp[], plugins: { plugin: string, directives: readonly DirectiveSpec[] }[], run?: OptionHelp): Map<string, DirectiveHelp> {
  const helps = new Map(builtin.map(info => [info.name, info]))
  for (const { plugin, directives } of plugins) {
    for (const spec of directives) {
      if (helps.has(spec.name)) continue
      const options = Object.fromEntries(Object.entries(spec.options ?? {}).map(([name, type]): [string, OptionHelp] => [name, name === 'run' && run ? { ...run, type } : { type }]))
      helps.set(spec.name, { name: spec.name, source: plugin, options, ...spec.arg === 'anchor' ? { anchor: true } : {} })
    }
  }
  return helps
}

export function optionsOf(info: DirectiveHelp, common: Record<string, OptionHelp>): Record<string, OptionHelp> {
  return { ...common, ...info.options }
}

export function anchorDirectives(helps: Map<string, DirectiveHelp>): Set<string> {
  return new Set([...helps.values()].filter(info => info.anchor).map(info => info.name))
}
