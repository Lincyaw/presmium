/**
 * The directives a deck accepts, for completion: the compiler's built-in
 * directives (docs/ir.md section 5.1) and those of the deck's plugins, with
 * their options.
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
  /** 'built-in', or the id of the plugin that provides it. */
  source: string
  doc?: string
  /** Options besides the common ones. */
  options: Record<string, OptionInfo>
}

/** Options every directive accepts. */
export const COMMON_OPTIONS: Record<string, OptionInfo> = {
  reveal: { doc: 'Appears at the next step; `items` on `{slide}` and `{only}` reveals list items one per step.', values: ['items'] },
  label: { type: 'string', doc: 'Block id.' },
}

const RUN: OptionInfo = { type: 'string', doc: '`compile` records the output at build time, `live` runs in the browser, `both` does both.', values: ['compile', 'live', 'both'] }

const CODE_OPTIONS: Record<string, OptionInfo> = {
  'caption': { type: 'string', doc: 'Title.' },
  'filename': { type: 'string', doc: 'Title.' },
  'emphasize-lines': { type: 'string', doc: 'Lines highlighted at every step, e.g. `2, 4-5`.' },
  'run': RUN,
  'executor': { type: 'string', doc: 'Executor id.' },
  'timeout': { type: 'number', doc: 'Milliseconds.' },
}

export const BUILTIN_DIRECTIVES: DirectiveInfo[] = [
  { name: 'slide', source: 'built-in', doc: 'Content shown on screen; the body is MyST.', options: {} },
  { name: 'only', source: 'built-in', doc: 'Content limited to renderers, e.g. `{only} web, notebook`.', options: {} },
  { name: 'hints', source: 'built-in', doc: 'Layout hints per renderer; the body is YAML.', options: {} },
  { name: 'component', source: 'built-in', doc: 'A plugin component, e.g. `{component} PmQuiz`; the body is YAML props.', options: { span: { type: 'number', doc: 'Internal steps.' }, plugin: { type: 'string', doc: 'Plugin id.' } } },
  { name: 'include', source: 'built-in', doc: 'Includes another source file.', options: {} },
  ...['code', 'code-block', 'code-cell', 'sourcecode'].map(name => ({ name, source: 'built-in', doc: 'Code; the argument is the language.', options: CODE_OPTIONS })),
]

/** The built-in directives followed by the plugins' directives. */
export function directiveInfos(plugins: { plugin: string, directives: readonly DirectiveSpec[] }[]): Map<string, DirectiveInfo> {
  const infos = new Map(BUILTIN_DIRECTIVES.map(info => [info.name, info]))
  for (const { plugin, directives } of plugins) {
    for (const spec of directives) {
      if (infos.has(spec.name)) continue
      const options = Object.fromEntries(Object.entries(spec.options ?? {}).map(([name, type]): [string, OptionInfo] => [name, name === 'run' ? { ...RUN, type } : { type }]))
      infos.set(spec.name, { name: spec.name, source: plugin, options })
    }
  }
  return infos
}

/** Every option of a directive, common ones first. */
export function optionsOf(info: DirectiveInfo): Record<string, OptionInfo> {
  return { ...COMMON_OPTIONS, ...info.options }
}
