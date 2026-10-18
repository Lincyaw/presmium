import type { DirectiveOptionType, Locale } from '@presmium/kernel'

export interface DirectiveOptionInfo {
  type?: DirectiveOptionType
  doc?: Record<Locale, string>
  values?: string[]
}

export interface DirectiveInfo {
  name: string
  doc: Record<Locale, string>
  options: Record<string, DirectiveOptionInfo>
}

export const COMMON_DIRECTIVE_OPTIONS: Record<string, DirectiveOptionInfo> = {
  reveal: {
    doc: { 'zh-CN': '在下一步出现；`{slide}`、`{only}` 上写 `items` 时列表逐项出现。', 'en': 'Appears at the next step; `items` on `{slide}` and `{only}` reveals list items one per step.' },
    values: ['items'],
  },
  label: { type: 'string', doc: { 'zh-CN': '块 ID。', 'en': 'Block id.' } },
  audience: {
    type: 'string',
    doc: { 'zh-CN': '只给这些受众（逗号分隔），如 `teacher`；`presmium build --audience student` 不输出它。', 'en': 'Only for these audiences (comma-separated), e.g. `teacher`; `presmium build --audience student` leaves it out.' },
    values: ['teacher', 'student'],
  },
}

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

const CLASS: DirectiveOptionInfo = { type: 'string', doc: { 'zh-CN': 'CSS 类名。', 'en': 'CSS class names.' } }

const LAYOUT_DIRECTIVES: DirectiveInfo[] = [
  {
    name: 'grid',
    doc: { 'zh-CN': '栅格：参数为四档屏宽（手机、小、中、大）的列数，如 `1 1 2 3`；正文为 `{card}` 或 `{grid-item}`。', 'en': 'A grid: the argument is the columns at four screen widths (phone, small, medium, large), e.g. `1 1 2 3`; the body holds `{card}` or `{grid-item}`.' },
    options: { class: CLASS },
  },
  {
    name: 'grid-item',
    doc: { 'zh-CN': '栅格中的一格。', 'en': 'An item of a grid.' },
    options: { columns: { type: 'number', doc: { 'zh-CN': '占一行 12 份中的几份。', 'en': 'How many twelfths of a row it takes.' } }, class: CLASS },
  },
  {
    name: 'card',
    doc: { 'zh-CN': '卡片：参数为标题；正文中 `^^^` 之前为页眉，`+++` 之后为页脚。', 'en': 'A card: the argument is its title; in the body, what precedes `^^^` is its header, what follows `+++` its footer.' },
    options: {
      link: { type: 'string', doc: { 'zh-CN': '整张卡片链接到的地址。', 'en': 'Where the whole card links to.' } },
      header: { type: 'string', doc: { 'zh-CN': '页眉。', 'en': 'Header.' } },
      footer: { type: 'string', doc: { 'zh-CN': '页脚。', 'en': 'Footer.' } },
    },
  },
  {
    name: 'tab-set',
    doc: { 'zh-CN': '一组选项卡；正文为 `{tab-item}`。', 'en': 'A set of tabs; the body holds `{tab-item}`.' },
    options: { class: CLASS },
  },
  {
    name: 'tab-item',
    doc: { 'zh-CN': '一个选项卡：参数为标题。', 'en': 'A tab: the argument is its title.' },
    options: {
      sync: { type: 'string', doc: { 'zh-CN': '同步键：选中它时，页面上同一键的选项卡一起切换。', 'en': 'Sync key: choosing it switches the tabs with the same key on the page.' } },
      selected: { type: 'boolean', doc: { 'zh-CN': '开始时选中。', 'en': 'Selected at first.' } },
    },
  },
]

export const BUILTIN_DIRECTIVE_INFO: readonly DirectiveInfo[] = [
  { name: 'slide', doc: { 'zh-CN': '上屏内容；正文为 MyST。', 'en': 'Content shown on screen; the body is MyST.' }, options: {} },
  { name: 'only', doc: { 'zh-CN': '只在这些渲染端出现的内容，如 `{only} web, notebook`。', 'en': 'Content limited to renderers, e.g. `{only} web, notebook`.' }, options: {} },
  { name: 'hints', doc: { 'zh-CN': '各渲染端的排版提示；正文为 YAML。', 'en': 'Layout hints per renderer; the body is YAML.' }, options: {} },
  { name: 'config', doc: { 'zh-CN': '只在本章节生效的插件配置；正文为 YAML，键为插件 ID。', 'en': 'Plugin configuration of this section; the body is YAML keyed by plugin id.' }, options: {} },
  { name: 'audience', doc: { 'zh-CN': '整个章节只给这些受众，如 `{audience} teacher`；放在章节顶层，没有正文。', 'en': 'The whole section is only for these audiences, e.g. `{audience} teacher`; at the top of a section, without a body.' }, options: {} },
  {
    name: 'component',
    doc: { 'zh-CN': '插件组件，如 `{component} PmQuiz`；正文为 YAML 属性。', 'en': 'A plugin component, e.g. `{component} PmQuiz`; the body is YAML props.' },
    options: { span: { type: 'number', doc: { 'zh-CN': '内部步数。', 'en': 'Internal steps.' } }, plugin: { type: 'string', doc: { 'zh-CN': '插件 ID。', 'en': 'Plugin id.' } } },
  },
  { name: 'include', doc: { 'zh-CN': '引入另一个源文件。', 'en': 'Includes another source file.' }, options: {} },
  {
    name: 'literalinclude',
    doc: { 'zh-CN': '以代码显示一个文件（或其中几行）；参数为文件路径。', 'en': 'Shows a file (or some of its lines) as code; the argument is the file path.' },
    options: {
      'language': { type: 'string', doc: { 'zh-CN': '语言；默认按扩展名。', 'en': 'Language; by default from the extension.' } },
      'lines': { type: 'string', doc: { 'zh-CN': '只显示这些行，如 `2, 4-6`。', 'en': 'Only these lines, e.g. `2, 4-6`.' } },
      'start-after': { type: 'string', doc: { 'zh-CN': '从含这段文字的行之后开始。', 'en': 'Starts after the line with this text.' } },
      'end-before': { type: 'string', doc: { 'zh-CN': '到含这段文字的行之前结束。', 'en': 'Ends before the line with this text.' } },
      'caption': CODE_OPTIONS.caption!,
      'emphasize-lines': CODE_OPTIONS['emphasize-lines']!,
    },
  },
  ...['code', 'code-block', 'code-cell', 'sourcecode'].map(name => ({ name, doc: { 'zh-CN': '代码；参数为语言。', 'en': 'Code; the argument is the language.' }, options: CODE_OPTIONS })),
  ...LAYOUT_DIRECTIVES,
]
