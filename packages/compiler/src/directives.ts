/**
 * The built-in directives as editors describe them (docs/ir.md section 5.1):
 * names, options and what they do, in the languages Presmium has messages
 * for. The compiler implements them in source.ts (`{include}`) and blocks.ts.
 */
import type { DirectiveOptionType, Locale } from '@presmium/kernel'

export interface DirectiveOptionInfo {
  type?: DirectiveOptionType
  doc?: Record<Locale, string>
  /** Values to offer. */
  values?: string[]
}

export interface DirectiveInfo {
  name: string
  doc: Record<Locale, string>
  /** Options besides the common ones. */
  options: Record<string, DirectiveOptionInfo>
}

/** Options every directive accepts. */
export const COMMON_DIRECTIVE_OPTIONS: Record<string, DirectiveOptionInfo> = {
  reveal: {
    doc: { 'zh-CN': '在下一步出现；`{slide}`、`{only}` 上写 `items` 时列表逐项出现。', 'en': 'Appears at the next step; `items` on `{slide}` and `{only}` reveals list items one per step.' },
    values: ['items'],
  },
  label: { type: 'string', doc: { 'zh-CN': '块 ID。', 'en': 'Block id.' } },
}

/** `:run:` of code blocks and of the plugins' code directives. */
export const RUN_OPTION: DirectiveOptionInfo = {
  type: 'string',
  doc: { 'zh-CN': '`compile` 在构建时执行并录制输出，`live` 只在浏览器中执行，`both` 两者都做。', 'en': '`compile` records the output at build time, `live` runs in the browser, `both` does both.' },
  values: ['compile', 'live', 'both'],
}

const TITLE = { 'zh-CN': '标题。', 'en': 'Title.' }

const CODE_OPTIONS: Record<string, DirectiveOptionInfo> = {
  'caption': { type: 'string', doc: TITLE },
  'filename': { type: 'string', doc: TITLE },
  'emphasize-lines': { type: 'string', doc: { 'zh-CN': '每一步都强调的行，如 `2, 4-5`。', 'en': 'Lines highlighted at every step, e.g. `2, 4-5`.' } },
  'run': RUN_OPTION,
  'executor': { type: 'string', doc: { 'zh-CN': '执行器 ID。', 'en': 'Executor id.' } },
  'timeout': { type: 'number', doc: { 'zh-CN': '毫秒。', 'en': 'Milliseconds.' } },
  'env': { type: 'string', doc: { 'zh-CN': '运行环境：头部 `execute.environments` 中的名字，或 `browser`。', 'en': 'Where it runs: a name of `execute.environments` in the headmatter, or `browser`.' } },
  'session': { type: 'string', doc: { 'zh-CN': '执行会话：同一会话的代码块共享解释器。', 'en': 'Execution session: code blocks of one session share the interpreter.' } },
  'echo': { type: 'string', doc: { 'zh-CN': '`false`：只显示输出，Markdown 输出按正文显示。', 'en': '`false`: only the output shows, Markdown output as prose.' }, values: ['false'] },
}

export const BUILTIN_DIRECTIVE_INFO: readonly DirectiveInfo[] = [
  { name: 'slide', doc: { 'zh-CN': '上屏内容；正文为 MyST。', 'en': 'Content shown on screen; the body is MyST.' }, options: {} },
  { name: 'only', doc: { 'zh-CN': '只在这些渲染端出现的内容，如 `{only} web, notebook`。', 'en': 'Content limited to renderers, e.g. `{only} web, notebook`.' }, options: {} },
  { name: 'hints', doc: { 'zh-CN': '各渲染端的排版提示；正文为 YAML。', 'en': 'Layout hints per renderer; the body is YAML.' }, options: {} },
  { name: 'config', doc: { 'zh-CN': '只在本章节生效的插件配置；正文为 YAML，键为插件 ID。', 'en': 'Plugin configuration of this section; the body is YAML keyed by plugin id.' }, options: {} },
  {
    name: 'component',
    doc: { 'zh-CN': '插件组件，如 `{component} PmQuiz`；正文为 YAML 属性。', 'en': 'A plugin component, e.g. `{component} PmQuiz`; the body is YAML props.' },
    options: { span: { type: 'number', doc: { 'zh-CN': '内部步数。', 'en': 'Internal steps.' } }, plugin: { type: 'string', doc: { 'zh-CN': '插件 ID。', 'en': 'Plugin id.' } } },
  },
  { name: 'include', doc: { 'zh-CN': '引入另一个源文件。', 'en': 'Includes another source file.' }, options: {} },
  ...['code', 'code-block', 'code-cell', 'sourcecode'].map(name => ({ name, doc: { 'zh-CN': '代码；参数为语言。', 'en': 'Code; the argument is the language.' }, options: CODE_OPTIONS })),
]
