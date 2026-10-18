export type Locale = 'zh-CN' | 'en'

export type ProjectKind = 'lecture' | 'workspace' | 'plugin'

export interface Messages {
  usage: string
  kindQuestion: string
  kinds: Record<ProjectKind, string>
  numberQuestion: string
  dirQuestion: string
  titleQuestion: string
  nameQuestion: string
  noAnswer: string
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
  --type <种类>    lecture（一份讲义）、workspace（多份文档的工作区，用 presmium serve 预览）
                   或 plugin（插件：指令、两种形态共用的组件与服务端路由）
  --title <标题>   讲义或工作区的标题（默认为目录名）
  --name <包名>    插件的包名（默认为目录名）
  --no-git         不运行 git init
  -h, --help       显示本说明`,
    kindQuestion: '新建哪种项目？',
    kinds: {
      lecture: '讲义：一份文稿，生成网页、幻灯片与 notebook',
      workspace: '工作区：多份文档与一个站点，用 presmium serve 预览',
      plugin: '插件：指令、网页与幻灯片共用的组件、服务端路由与集成测试',
    },
    numberQuestion: '编号',
    dirQuestion: '目录',
    titleQuestion: '标题',
    nameQuestion: '包名',
    noAnswer: '没有读到回答：用 --type 与目录给出项目（presmium new --help）',
    badKind: kind => `没有这种项目：${kind}（可选 lecture、workspace、plugin）`,
    badName: name => `不能用作包名：${name}（小写字母、数字与 - . _，可以带 @作用域/）`,
    notEmpty: dir => `${dir} 已存在且不是空目录`,
    created: (kind, dir) => `已在 ${dir} 新建${{ lecture: '讲义', workspace: '工作区', plugin: '插件' }[kind]}。`,
    next: '接下来：',
    agents: '编程智能体：AGENTS.md 与 .agents/skills 中的技能。',
    firstDocument: '第一讲',
    readme: (kind, title) => kind === 'lecture'
      ? `# ${title}

一份 Presmium 讲义：源码是 \`lecture.md\`（MyST Markdown），Presmium 把它编译为网页、幻灯片与 notebook。命令来自 \`pnpm add -g presmium\`；在本目录 \`pnpm install\` 之后，用的是 \`package.json\` 锁定的版本。

\`\`\`sh
presmium dev       # 实时预览网页与幻灯片
presmium check     # 检查讲义：语法、插件、链接
presmium build     # 构建网页、幻灯片与 notebook，产物在 dist/
\`\`\`

\`AGENTS.md\` 是给编程智能体的说明，技能在 \`.agents/skills\`。Presmium：${REPOSITORY}
`
      : `# ${title}

一个 Presmium 工作区：每个子目录中的 \`lecture.md\` 是一份文档（第一份在 \`intro/\`），\`presmium.workspace.yaml\` 是工作区的配置。命令来自 \`pnpm add -g presmium\`；在本目录 \`pnpm install\` 之后，用的是 \`package.json\` 锁定的版本。

\`\`\`sh
presmium serve           # 文档列表与各文档的实时预览，只在本机
presmium check intro     # 检查一份文档
presmium build           # 构建工作区的站点，产物在 dist/web/
\`\`\`

编辑与 agent 在工作台中：\`pnpm add -g @presmium/studio\` 后运行 \`presmium-studio\`（实验性）。修改历史与撤销都是 git 提交，所以工作区要是 git 仓库（create-presmium 在 git 仓库之外新建工作区时运行 git init）。工作区配置列出的助手插件给读者“提问”。

\`AGENTS.md\` 是给编程智能体的说明，技能在 \`.agents/skills\`。Presmium：${REPOSITORY}
`,
    agentsFile: (kind, title) => `# ${title}

${kind === 'lecture'
  ? '这是一份 Presmium 讲义：`lecture.md` 是源码（MyST Markdown），`presmium` 把它编译为网页、幻灯片与 notebook。'
  : '这是一个 Presmium 工作区：每个子目录中的 `lecture.md` 是一份文档，`presmium.workspace.yaml` 是工作区的配置（运营者设置在 `settings` 中，文档改不了它）。'}只改源码，不改 \`dist/\` 中的产物。

技能（\`.agents/skills\`）：

- \`presmium-author\`：编写与修改讲义：文稿头部、章节、讲解与上屏内容、指令、检查与构建。
- \`presmium-present\`：放映、演讲者视图、课堂与讲授。

技能为 Presmium 的仓库而写：其中的 \`docs/\`、\`examples/\` 等路径在 ${REPOSITORY}。

改完后运行 \`${kind === 'lecture' ? 'presmium check' : 'presmium check <文档目录>'}\` 并修复它报告的问题；\`presmium build\` 构建${kind === 'lecture' ? '网页、幻灯片与 notebook' : '工作区的站点'}。
`,
  },
  'en': {
    usage: `Usage: presmium new [<directory>] [<options>] (or pnpm create presmium [<directory>] [<options>])

Makes a new Presmium project in <directory>; asks for what --type or the directory leaves out.

Options:
  --type <kind>    lecture (one document), workspace (documents to preview with presmium serve)
                   or plugin (a directive, a component of both forms, a server route)
  --title <text>   the lecture's or the workspace's title (default: the directory's name)
  --name <name>    the plugin's package name (default: the directory's name)
  --no-git         do not run git init
  -h, --help       show this help`,
    kindQuestion: 'Which project?',
    kinds: {
      lecture: 'lecture: one document, as a web page, slides and a notebook',
      workspace: 'workspace: documents and a site, previewed with presmium serve',
      plugin: 'plugin: a directive, a component of the web page and the slides, a server route and tests',
    },
    numberQuestion: 'Number',
    dirQuestion: 'Directory',
    titleQuestion: 'Title',
    nameQuestion: 'Package name',
    noAnswer: 'no answer read: give the project with --type and a directory (presmium new --help)',
    badKind: kind => `no such project: ${kind} (lecture, workspace or plugin)`,
    badName: name => `not a package name: ${name} (lowercase letters, digits and - . _, with an optional @scope/)`,
    notEmpty: dir => `${dir} exists and is not empty`,
    created: (kind, dir) => `Made a ${kind} in ${dir}.`,
    next: 'Next:',
    agents: 'For coding agents: AGENTS.md, and the skills in .agents/skills.',
    firstDocument: 'Lecture 1',
    readme: (kind, title) => kind === 'lecture'
      ? `# ${title}

A Presmium lecture: \`lecture.md\` (MyST Markdown) is the source, which Presmium compiles to a web page,
slides and a notebook. The commands come from \`pnpm add -g presmium\`; after \`pnpm install\` here, they
are the version \`package.json\` pins.

\`\`\`sh
presmium dev       # a live preview of the web page and the slides
presmium check     # checks the lecture: syntax, plugins, links
presmium build     # builds the web page, the slides and the notebook into dist/
\`\`\`

\`AGENTS.md\` is for coding agents, with the skills in \`.agents/skills\`. Presmium: ${REPOSITORY}
`
      : `# ${title}

A Presmium workspace: the \`lecture.md\` of each subdirectory is a document (the first in \`intro/\`), and
\`presmium.workspace.yaml\` is the workspace's configuration. The commands come from \`pnpm add -g presmium\`;
after \`pnpm install\` here, they are the version \`package.json\` pins.

\`\`\`sh
presmium serve           # the documents and their live previews, on this machine
presmium check intro     # checks one document
presmium build           # builds the workspace's site into dist/web/
\`\`\`

Editing and the agent are in the workbench: \`pnpm add -g @presmium/studio\`, then \`presmium-studio\`
(experimental). The history and undo are git commits, so the workspace is a git repository (create-presmium
runs git init when it makes one outside a git repository). The assistant plugin the configuration lists
gives readers "Ask".

\`AGENTS.md\` is for coding agents, with the skills in \`.agents/skills\`. Presmium: ${REPOSITORY}
`,
    agentsFile: (kind, title) => `# ${title}

${kind === 'lecture'
  ? 'This is a Presmium lecture: `lecture.md` is the source (MyST Markdown), which `presmium` compiles to a web page, slides and a notebook.'
  : 'This is a Presmium workspace: the `lecture.md` of each subdirectory is a document, and `presmium.workspace.yaml` is the workspace\'s configuration (the operator\'s settings are in its `settings`, which no document changes).'} Change the sources, never the output in \`dist/\`.

Skills (\`.agents/skills\`, in Chinese):

- \`presmium-author\`: writing and changing documents: the frontmatter, sections, narration and what shows on screen, directives, checks and builds.
- \`presmium-present\`: presenting, the presenter view, the classroom and lectures.

The skills are written for the Presmium repository: their paths \`docs/\`, \`examples/\` and so on are in ${REPOSITORY}.

After a change, run \`${kind === 'lecture' ? 'presmium check' : 'presmium check <document directory>'}\` and fix what it reports; \`presmium build\` builds ${kind === 'lecture' ? 'the web page, the slides and the notebook' : 'the workspace\'s site'}.
`,
  },
}

export function systemLocale(env: NodeJS.ProcessEnv = process.env): Locale {
  const tag = env.LC_ALL || env.LC_MESSAGES || env.LANG || Intl.DateTimeFormat().resolvedOptions().locale
  return /^zh/i.test(tag) ? 'zh-CN' : 'en'
}
