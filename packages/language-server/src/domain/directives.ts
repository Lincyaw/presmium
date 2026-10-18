import type { DirectiveOptionType, DirectiveSpec } from '@presmium/kernel'

export interface OptionInfo {
  type?: DirectiveOptionType
  doc?: string
  values?: string[]
}

export interface DirectiveInfo {
  name: string
  source: string
  doc?: string
  options: Record<string, OptionInfo>
  anchor?: boolean
}

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

export function optionsOf(info: DirectiveInfo, common: Record<string, OptionInfo>): Record<string, OptionInfo> {
  return { ...common, ...info.options }
}

export function anchorDirectives(infos: Map<string, DirectiveInfo>): Set<string> {
  return new Set([...infos.values()].filter(info => info.anchor).map(info => info.name))
}
