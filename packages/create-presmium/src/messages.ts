import type { ProjectKind } from './create.ts'

export type Locale = 'zh-CN' | 'en'

export interface Messages {
  usage: string
  kindQuestion: string
  kinds: Record<ProjectKind, string>
  numberQuestion: string
  dirQuestion: string
  titleQuestion: string
  nameQuestion: string
  noAnswer: string
  tooManyDirectories(count: number): string
  badKind(kind: string): string
  badName(name: string): string
  notEmpty(dir: string): string
  created(kind: ProjectKind, dir: string): string
  next: string
  agents: string
  firstDocument: string
  readme(kind: 'lecture' | 'workspace', title: string): string
  agentsFile(kind: 'lecture' | 'workspace', title: string): string
}

const REPOSITORY = 'https://github.com/Lincyaw/presmium'

export const MESSAGES: Record<Locale, Messages> = {
  'zh-CN': {
    usage: `用法：presmium new [<目录>] [<选项>]（或 pnpm create presmium [<目录>] [<选项>]）

在 <目录> 中新建一个 Presmium 项目；没有给出 --type 或目录时逐项询问。

选项：
  --type <种类>    lecture（一份讲义）、workspace（含多份文稿的工作区，用 presmium serve 预览）
                   或 plugin（插件：指令、两种形态共用的组件与服务端路由）
  --title <标题>   讲义或工作区的标题（默认为目录名）
  --name <包名>    插件的包名（默认为目录名）
  --no-git         不运行 git init
  -h, --help       显示本说明`,
    kindQuestion: '新建哪种项目？',
    kinds: {
      lecture: '讲义：一份文稿，导出为网页、幻灯片与 Notebook',
      workspace: '工作区：多份文稿与一个网站，用 presmium serve 预览',
      plugin: '插件：指令、网页与幻灯片共用的组件、服务端路由与集成测试',
    },
    numberQuestion: '编号',
    dirQuestion: '目录',
    titleQuestion: '标题',
    nameQuestion: '包名',
    tooManyDirectories: count => `给出了 ${count} 个目录。请只给出一个目录。`,
    noAnswer: '没有读到回答。请用 --type 与目录给出项目，用法见 presmium new --help。',
    badKind: kind => `没有“${kind}”这种项目。请选择 lecture、workspace 或 plugin。`,
    badName: name => `“${name}”不能用作包名。请只用小写字母、数字与 - . _，可以带 @作用域/。`,
    notEmpty: dir => `${dir} 已存在且不是空目录。请换一个目录，或先清空它。`,
    created: (kind, dir) => `已在 ${dir} 新建${kind === 'lecture' ? '讲义' : kind === 'workspace' ? '工作区' : '插件'}。`,
    next: '接下来：',
    agents: '给 AI 编程工具的说明：AGENTS.md 与 .agents/skills 中的技能。',
    firstDocument: '第一讲',
    readme: (kind, title) => kind === 'lecture'
      ? `# ${title}

一份 Presmium 讲义：文稿保存在 \`lecture.json\` 中，Presmium 把它导出为网页、幻灯片与 Notebook。命令来自 \`pnpm add -g @lincyaw/presmium\`；在本目录运行 \`pnpm install\` 之后，用的是 \`package.json\` 锁定的版本。

\`\`\`sh
presmium dev       # 实时预览网页与幻灯片
presmium check     # 检查讲义：语法、插件、链接
presmium build     # 导出网页、幻灯片与 Notebook，产物在 dist/
\`\`\`

\`AGENTS.md\` 是给 AI 编程工具的说明，技能在 \`.agents/skills\`。Presmium：${REPOSITORY}
`
      : `# ${title}

一个 Presmium 工作区：每个子目录中的 \`lecture.json\` 是一份文稿（第一份在 \`intro/\`），\`presmium.workspace.yaml\` 是工作区的配置。命令来自 \`pnpm add -g @lincyaw/presmium\`；在本目录运行 \`pnpm install\` 之后，用的是 \`package.json\` 锁定的版本。

\`\`\`sh
presmium serve           # 文稿列表与各文稿的实时预览，只在本机
presmium check intro     # 检查一份文稿
presmium build           # 把工作区导出为网站，产物在 dist/web/
\`\`\`

在浏览器中编辑并使用 AI 助手：运行 \`pnpm add -g @lincyaw/studio\` 后启动 \`presmium-studio\`（Presmium Studio，实验性）。版本历史与撤消记录在 git 中，所以工作区是一个 git 仓库（在 git 仓库之外新建工作区时会运行 git init）。工作区配置中列出的读者问答插件让读者可以“提问”。

\`AGENTS.md\` 是给 AI 编程工具的说明，技能在 \`.agents/skills\`。Presmium：${REPOSITORY}
`,
    agentsFile: (kind, title) => `# ${title}

${kind === 'lecture'
  ? '这是一份 Presmium 讲义：文稿是 `lecture.json`，`presmium` 把它导出为网页、幻灯片与 Notebook。'
  : '这是一个 Presmium 工作区：每个子目录中的 `lecture.json` 是一份文稿，`presmium.workspace.yaml` 是工作区的配置（运营者设置在 `settings` 中，文稿不能修改它）。'}只修改文稿与代码，不修改 \`dist/\` 中的产物。

技能（\`.agents/skills\`，英文，自包含）：

- \`presmium-author\`：编写与修改讲义：文稿实体、页面、内容块、步骤与讲稿、检查与导出。
- \`presmium-animate\`：动画：按教学场景选择做法、用代码写的动画场景（附每个动画库的效果合集）、让动画与配音对齐。
- \`presmium-present\`：放映、演示者视图、课堂与讲授。

修改后运行 \`${kind === 'lecture' ? 'presmium check' : 'presmium check <文稿目录>'}\` 并修复它报告的问题；\`presmium build\` 导出${kind === 'lecture' ? '网页、幻灯片与 Notebook' : '工作区的网站'}。
`,
  },
  'en': {
    usage: `Usage: presmium new [<directory>] [<options>] (or pnpm create presmium [<directory>] [<options>])

Makes a new Presmium project in <directory>; asks for what --type or the directory leaves out.

Options:
  --type <kind>    lecture (one document), workspace (documents to preview with presmium serve),
                   or plugin (a directive, a component of both forms, and a server route)
  --title <text>   the lecture’s or the workspace’s title (default: the directory’s name)
  --name <name>    the plugin’s package name (default: the directory’s name)
  --no-git         do not run git init
  -h, --help       show this help`,
    kindQuestion: 'Which project?',
    kinds: {
      lecture: 'lecture: one document, as a web page, slides, and a Notebook',
      workspace: 'workspace: documents and a website, previewed with presmium serve',
      plugin: 'plugin: a directive, a component of the web page and the slides, a server route, and tests',
    },
    numberQuestion: 'Number',
    dirQuestion: 'Directory',
    titleQuestion: 'Title',
    nameQuestion: 'Package name',
    tooManyDirectories: count => `${count} directories were given. Give one directory.`,
    noAnswer: 'No answer was read. Give the project with --type and a directory (see presmium new --help).',
    badKind: kind => `There is no project “${kind}”. Choose lecture, workspace, or plugin.`,
    badName: name => `“${name}” is not a package name. Use lowercase letters, digits, and - . _, with an optional @scope/.`,
    notEmpty: dir => `${dir} exists and is not empty. Choose another directory, or empty it first.`,
    created: (kind, dir) => `Made a ${kind} in ${dir}.`,
    next: 'Next:',
    agents: 'For AI coding tools: AGENTS.md, and the skills in .agents/skills.',
    firstDocument: 'Lecture 1',
    readme: (kind, title) => kind === 'lecture'
      ? `# ${title}

A Presmium lecture: the document is \`lecture.json\`, which Presmium exports to a web page, slides, and a
Notebook. The commands come from \`pnpm add -g @lincyaw/presmium\`; after \`pnpm install\` here, they are the
version \`package.json\` pins.

\`\`\`sh
presmium dev       # a live preview of the web page and the slides
presmium check     # checks the lecture: syntax, plugins, links
presmium build     # exports the web page, the slides, and the Notebook into dist/
\`\`\`

\`AGENTS.md\` is for AI coding tools, with the skills in \`.agents/skills\`. Presmium: ${REPOSITORY}
`
      : `# ${title}

A Presmium workspace: the \`lecture.json\` of each subdirectory is a document (the first in \`intro/\`), and
\`presmium.workspace.yaml\` is the workspace’s configuration. The commands come from \`pnpm add -g @lincyaw/presmium\`;
after \`pnpm install\` here, they are the version \`package.json\` pins.

\`\`\`sh
presmium serve           # the documents and their live previews, on this machine
presmium check intro     # checks one document
presmium build           # exports the workspace as a website into dist/web/
\`\`\`

Editing in the browser, with the AI Assistant: \`pnpm add -g @lincyaw/studio\`, then \`presmium-studio\`
(Presmium Studio, experimental). Version History and Undo are kept in git, so the workspace is a git
repository (a new workspace outside a git repository gets git init). The Reader Q&A plugin the
configuration lists lets readers “Ask”.

\`AGENTS.md\` is for AI coding tools, with the skills in \`.agents/skills\`. Presmium: ${REPOSITORY}
`,
    agentsFile: (kind, title) => `# ${title}

${kind === 'lecture'
  ? 'This is a Presmium lecture: the document is `lecture.json`, which `presmium` exports to a web page, slides, and a Notebook.'
  : 'This is a Presmium workspace: the `lecture.json` of each subdirectory is a document, and `presmium.workspace.yaml` is the workspace’s configuration (the operator’s settings are in its `settings`, which no document changes).'} Change the documents and the code, never the output in \`dist/\`.

Skills (\`.agents/skills\`, self-contained):

- \`presmium-author\`: writing and changing documents: document entities, pages, content blocks, steps and scripts, checks, and exports.
- \`presmium-animate\`: animation: the way to show each teaching moment, scenes written in code (with a gallery of effects for each animation library), and putting them on the voiceover.
- \`presmium-present\`: presenting, the Presenter View, the classroom, and lectures.

After a change, run \`${kind === 'lecture' ? 'presmium check' : 'presmium check <document directory>'}\` and fix what it reports; \`presmium build\` exports ${kind === 'lecture' ? 'the web page, the slides, and the Notebook' : 'the workspace’s website'}.
`,
  },
}

export function systemLocale(env: NodeJS.ProcessEnv = process.env): Locale {
  const tag = env.LC_ALL || env.LC_MESSAGES || env.LANG || Intl.DateTimeFormat().resolvedOptions().locale
  return /^zh/i.test(tag) ? 'zh-CN' : 'en'
}
