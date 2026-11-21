export { systemLocale } from '@lincyaw/kernel/node'
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
  badTheme(theme: string): string
  themeOnlyForSite: string
  badName(name: string): string
  notEmpty(dir: string): string
  created(kind: ProjectKind, dir: string): string
  next: string
  agents: string
  firstDocument: string
  site: Record<'lang' | 'description' | 'guideTitle' | 'guideIntro' | 'guideStartTitle' | 'guideStartBody' | 'guideStyleTitle' | 'guideStyleBody' | 'guidePublishTitle' | 'guidePublishBody', string>
  readme(kind: 'document' | 'workspace' | 'site', title: string): string
  agentsFile(kind: 'document' | 'workspace' | 'site', title: string): string
}

const REPOSITORY = 'https://github.com/Lincyaw/presmium'

export const MESSAGES: Record<Locale, Messages> = {
  'zh-CN': {
    usage: `用法：presmium new [<目录>] [<选项>]（或 pnpm create presmium [<目录>] [<选项>]）

在 <目录> 中新建一个 Presmium 项目；没有给出 --type 或目录时逐项询问。

选项：
  --type <种类>    document（一份文稿）、workspace（多份文稿）、site（带首页与发布流程的网站）
                   或 plugin（插件：指令、两种形态共用的组件与服务端路由）
  --theme <主题>   site 的主题：course、docs 或 showcase（默认 course）
  --title <标题>   文稿、工作区或网站的标题（默认为目录名）
  --name <包名>    插件的包名（默认为目录名）
  --no-git         不运行 git init
  -h, --help       显示本说明`,
    kindQuestion: '新建哪种项目？',
    kinds: {
      document: '一份文稿，导出为网页、幻灯片与 Notebook',
      workspace: '工作区：多份文稿与一个网站，用 presmium serve 预览',
      site: '网站：可编辑首页、内容文稿与 GitHub Pages 发布流程',
      plugin: '插件：指令、网页与幻灯片共用的组件、服务端路由与集成测试',
    },
    numberQuestion: '编号',
    dirQuestion: '目录',
    titleQuestion: '标题',
    nameQuestion: '包名',
    tooManyDirectories: count => `给出了 ${count} 个目录。请只给出一个目录。`,
    noAnswer: '没有读到回答。请用 --type 与目录给出项目，用法见 presmium new --help。',
    badKind: kind => `没有“${kind}”这种项目。请选择 document、workspace、site 或 plugin。`,
    badTheme: theme => `没有“${theme}”这种主题。请选择 course、docs 或 showcase。`,
    themeOnlyForSite: '--theme 只用于网站。请同时指定 --type site。',
    badName: name => `“${name}”不能用作包名。请只用小写字母、数字与 - . _，可以带 @作用域/。`,
    notEmpty: dir => `${dir} 已存在且不是空目录。请换一个目录，或先清空它。`,
    created: (kind, dir) => `已在 ${dir} 新建${kind === 'document' ? '文稿' : kind === 'workspace' ? '工作区' : kind === 'site' ? '网站' : '插件'}。`,
    next: '接下来：',
    agents: '给 AI 编程工具的说明：AGENTS.md 与 .agents/skills 中的技能。',
    firstDocument: '第一讲',
    site: {
      lang: 'zh-CN',
      description: '用文稿构建课程、文档与作品网站。',
      guideTitle: '开始创作',
      guideIntro: '这是你的第一份内容文稿。用自己的文字替换它，再添加更多章节和素材。',
      guideStartTitle: '写下第一篇内容',
      guideStartBody: '网站首页单独编排，课程文章保存在文稿中。替换示例内容，再在新的子目录中新建文稿，具体文件与命令见项目的 README。',
      guideStyleTitle: '选择网站主题',
      guideStyleBody: '在 presmium.workspace.yaml 的 site 中设置 theme：course 适合课程，docs 适合文档，showcase 适合展示作品。params 可以调整 accent、typography 和 contentWidth；theme 写成主题目录（如 ./theme）时，可以自定义配色、字体与样式。',
      guidePublishTitle: '发布你的网站',
      guidePublishBody: '导出网站后，静态产物在 dist/web/。将项目推送到 GitHub，并在仓库的 Pages 设置中选择 GitHub Actions，项目附带的工作流会在 main 分支更新时导出和发布。',
    },
    readme: (kind, title) => kind === 'site'
      ? `# ${title}

一个 Presmium 网站：独立网站首页保存在 \`site/home.json\`，第一份文稿在 \`intro/index.pmd\`。首页先只列出全部文稿，需要时再加入首屏、亮点等板块；文稿负责正文、步骤和放映。\`presmium.workspace.yaml\` 的 \`site\` 配置主题、个性化参数、导航与首页入口。

\`\`\`sh
pnpm install
pnpm serve     # 本地实时预览
pnpm check     # 检查文稿
pnpm build     # 导出网站到 dist/web/
\`\`\`

在 \`site.theme\` 中选择 \`course\`、\`docs\` 或 \`showcase\`，在 \`site.params\` 中调整 \`accent\`、\`typography\` 与 \`contentWidth\`。需要自己的配色、字体与样式时，把 \`site.theme\` 写成主题目录（如 \`./theme\`），在其中的 \`theme.json\` 中设置设计令牌与样式表。

默认首页入口是 \`site.landing: { source: './site/home.json' }\`。需要自行设计 HTML 首页时，创建 \`site/home.html\` 并改为 \`site.landing: { template: './site/home.html' }\`；文稿继续使用各目录中的 \`index.pmd\`。

发布到 GitHub Pages：提交项目与安装生成的 \`pnpm-lock.yaml\`，推送到 GitHub 仓库，在 Settings → Pages 中将 Source 设为 GitHub Actions。\`.github/workflows/pages.yml\` 在 \`main\` 分支更新时构建并发布 \`dist/web/\`，也可以手动运行。部署路径由工作流自动设置；使用自定义域名时，按 GitHub Pages 的说明配置域名。

## 编辑

- 在浏览器中编辑：Presmium 已包含 Studio（实验版），在本目录运行 \`presmium studio\`，打开终端打印的网址。工作台提供页面、正文、讲稿、批注与版本历史；编辑和预览都不需要配置模型。版本历史记录在 git 中，所以本目录需要是一个 git 仓库（新建时会自动运行 git init）。
- 交给 AI 工具：在 Claude Code、Codex 等工具中打开本目录，用自然语言描述要改的内容。\`AGENTS.md\` 与 \`.agents/skills\` 说明文稿结构与检查方法。项目附带的 \`.mcp.json\` 让从本目录启动的 Claude Code 连接原生 MCP 服务；Codex 用 \`codex mcp add presmium -- presmium mcp <本目录的绝对路径>\` 一次配置。\`presmium mcp\` 自动启动或复用工作区服务，初始化后即可编辑与截帧。需要作者窗口或审批窗口时运行 \`presmium studio\`；自动启动不批准收费操作或源文件写入。
- \`index.pmd\` 由工具读写，不适合手工编辑；修改后运行 \`presmium check\` 确认文稿有效。

\`AGENTS.md\` 与 \`.agents/skills\` 是给 AI 编程工具的说明。Presmium：${REPOSITORY}
`
      : kind === 'document'
      ? `# ${title}

一份 Presmium 文稿：保存在 \`index.pmd\` 中，Presmium 把它导出为网页、幻灯片与 Notebook。命令来自 \`pnpm add -g @lincyaw/presmium\`；在本目录运行 \`pnpm install\` 之后，用的是 \`package.json\` 锁定的版本。

\`\`\`sh
presmium dev       # 实时预览网页与幻灯片
presmium check     # 检查文稿：语法、插件、链接
presmium build     # 导出网页、幻灯片与 Notebook，产物在 dist/
\`\`\`

## 编辑

- 在浏览器中编辑：Presmium 已包含 Studio（实验版），在本目录运行 \`presmium studio\`，打开终端打印的网址。工作台提供页面、正文、讲稿、批注与版本历史；编辑和预览都不需要配置模型。版本历史记录在 git 中，所以本目录需要是一个 git 仓库（新建时会自动运行 git init）。
- 交给 AI 工具：在 Claude Code、Codex 等工具中打开本目录，用自然语言描述要改的内容。\`AGENTS.md\` 与 \`.agents/skills\` 说明文稿结构与检查方法。项目附带的 \`.mcp.json\` 让从本目录启动的 Claude Code 连接原生 MCP 服务；Codex 用 \`codex mcp add presmium -- presmium mcp <本目录的绝对路径>\` 一次配置。\`presmium mcp\` 自动启动或复用工作区服务，初始化后即可编辑与截帧。需要作者窗口或审批窗口时运行 \`presmium studio\`；自动启动不批准收费操作或源文件写入。
- \`index.pmd\` 由工具读写，不适合手工编辑；修改后运行 \`presmium check\` 确认文稿有效。

\`AGENTS.md\` 是给 AI 编程工具的说明，技能在 \`.agents/skills\`。Presmium：${REPOSITORY}
`
      : `# ${title}

一个 Presmium 工作区：每个子目录中的 \`index.pmd\` 是一份文稿（第一份在 \`intro/\`），\`presmium.workspace.yaml\` 是工作区的配置。命令来自 \`pnpm add -g @lincyaw/presmium\`；在本目录运行 \`pnpm install\` 之后，用的是 \`package.json\` 锁定的版本。

\`\`\`sh
presmium serve           # 文稿列表与各文稿的实时预览，只在本机
presmium check intro     # 检查一份文稿
presmium build           # 把工作区导出为网站，产物在 dist/web/
\`\`\`

工作区配置中列出的读者问答插件让读者可以“提问”。

## 编辑

- 在浏览器中编辑：Presmium 已包含 Studio（实验版），在本目录运行 \`presmium studio\`，打开终端打印的网址。工作台提供页面、正文、讲稿、批注与版本历史；编辑和预览都不需要配置模型。版本历史记录在 git 中，所以本目录需要是一个 git 仓库（新建时会自动运行 git init）。
- 交给 AI 工具：在 Claude Code、Codex 等工具中打开本目录，用自然语言描述要改的内容。\`AGENTS.md\` 与 \`.agents/skills\` 说明文稿结构与检查方法。项目附带的 \`.mcp.json\` 让从本目录启动的 Claude Code 连接原生 MCP 服务；Codex 用 \`codex mcp add presmium -- presmium mcp <本目录的绝对路径>\` 一次配置。\`presmium mcp\` 自动启动或复用工作区服务，初始化后即可编辑与截帧。需要作者窗口或审批窗口时运行 \`presmium studio\`；自动启动不批准收费操作或源文件写入。
- \`index.pmd\` 由工具读写，不适合手工编辑；修改后运行 \`presmium check\` 确认文稿有效。

\`AGENTS.md\` 是给 AI 编程工具的说明，技能在 \`.agents/skills\`。Presmium：${REPOSITORY}
`,
    agentsFile: (kind, title) => `# ${title}

${kind === 'document'
  ? '这是一份 Presmium 文稿：保存在 `index.pmd` 中，`presmium` 把它导出为网页、幻灯片与 Notebook。'
  : kind === 'site'
  ? '这是一个 Presmium 网站：独立首页在 `site/home.json`，由 `presmium.workspace.yaml` 的 `site.landing.source` 指定；也可以通过 `site.landing.template` 使用 `site/home.html`。首页自由编排品牌介绍和网站板块，内容始终写在各目录的 `index.pmd`（第一份为 `intro/index.pmd`），保持文稿、步骤与放映的同一内容入口。'
  : '这是一个 Presmium 工作区：每个子目录中的 `index.pmd` 是一份文稿，`presmium.workspace.yaml` 是工作区的配置（运营者设置在 `settings` 中，文稿不能修改它）。'}只修改文稿与代码，不修改 \`dist/\` 中的产物。

技能（\`.agents/skills\`，英文，自包含）：

- \`presmium-author\`：编写、放映与制作文稿：网页与幻灯片两种版本的写法、页面、内容块、步骤与讲稿、配音与讲授视频、课堂、检查、导出与发布。
- \`presmium-animate\`：动画：按教学场景选择做法、用代码写的动画场景（附每个动画库的效果合集）、让动画与配音对齐。

连接原生 MCP 服务 \`presmium\`（\`.mcp.json\`，命令 \`presmium mcp\`）后，按 \`presmium-author\` 技能中的 “Work through the tools” 直接调用作者动作修改文稿、检查与截帧。默认命令在初始化前启动或复用工作区服务；工作目录须为本项目，也可显式传入工作区或文稿的绝对路径。仅在明确使用 \`--compiler-only\` 或没有 MCP 宿主时直接修改 \`index.pmd\`。中断后先查保存历史或任务状态，不重发结果未知的写入；自动启动保留收费、源文件写入与浏览器操作的审批。

修改后运行 \`${kind === 'document' ? 'presmium check' : 'presmium check <文稿目录>'}\` 并修复它报告的问题；\`presmium build\` 导出${kind === 'document' ? '网页、幻灯片与 Notebook' : '工作区的网站'}。
`,
  },
  'en': {
    usage: `Usage: presmium new [<directory>] [<options>] (or pnpm create presmium [<directory>] [<options>])

Makes a new Presmium project in <directory>; asks for what --type or the directory leaves out.

Options:
  --type <kind>    document (one document), workspace (documents), site (a home page and publishing),
                   or plugin (a directive, a component of both forms, and a server route)
  --theme <name>   site theme: course, docs, or showcase (default: course)
  --title <text>   the document, workspace, or site title (default: the directory’s name)
  --name <name>    the plugin’s package name (default: the directory’s name)
  --no-git         do not run git init
  -h, --help       show this help`,
    kindQuestion: 'Which project?',
    kinds: {
      document: 'document: one document, as a web page, slides, and a Notebook',
      workspace: 'workspace: documents and a website, previewed with presmium serve',
      site: 'site: an editable home page, documents, and a GitHub Pages workflow',
      plugin: 'plugin: a directive, a component of the web page and the slides, a server route, and tests',
    },
    numberQuestion: 'Number',
    dirQuestion: 'Directory',
    titleQuestion: 'Title',
    nameQuestion: 'Package name',
    tooManyDirectories: count => `${count} directories were given. Give one directory.`,
    noAnswer: 'No answer was read. Give the project with --type and a directory (see presmium new --help).',
    badKind: kind => `There is no project “${kind}”. Choose document, workspace, site, or plugin.`,
    badTheme: theme => `There is no theme “${theme}”. Choose course, docs, or showcase.`,
    themeOnlyForSite: '--theme is only for a site. Add --type site.',
    badName: name => `“${name}” is not a package name. Use lowercase letters, digits, and - . _, with an optional @scope/.`,
    notEmpty: dir => `${dir} exists and is not empty. Choose another directory, or empty it first.`,
    created: (kind, dir) => `Made a ${kind} in ${dir}.`,
    next: 'Next:',
    agents: 'For AI coding tools: AGENTS.md, and the skills in .agents/skills.',
    firstDocument: 'Lecture 1',
    site: {
      lang: 'en',
      description: 'A home for your courses, documentation, and projects.',
      guideTitle: 'Start Creating',
      guideIntro: 'This is your first document. Replace it with your own words, then add more chapters and resources.',
      guideStartTitle: 'Write your first article',
      guideStartBody: 'Design your website home page separately from the documents that hold your articles. Replace the sample content, then add documents in new subdirectories. The project’s README lists the files and commands.',
      guideStyleTitle: 'Choose Your Site Style',
      guideStyleBody: 'Set theme under site in presmium.workspace.yaml: course for courses, docs for documentation, or showcase for your projects. Use params to adjust accent, typography, and contentWidth; set theme to a theme directory (such as ./theme) for your own colors, fonts, and styles.',
      guidePublishTitle: 'Share Your Site',
      guidePublishBody: 'Export your site into dist/web/. Push the project to GitHub and choose GitHub Actions in the repository’s Pages settings. The included workflow exports and publishes changes to main.',
    },
    readme: (kind, title) => kind === 'site'
      ? `# ${title}

A Presmium site: the independent website home page is \`site/home.json\`, and your first document is \`intro/index.pmd\`. The home page starts as the list of your documents, and takes a hero and other sections when you need them; documents hold the content, steps, and presentation. The \`site\` section of \`presmium.workspace.yaml\` sets the theme, appearance parameters, navigation, and home page.

\`\`\`sh
pnpm install
pnpm serve     # a live local preview
pnpm check     # checks the document
pnpm build     # exports the website into dist/web/
\`\`\`

Choose \`course\`, \`docs\`, or \`showcase\` in \`site.theme\`. Adjust \`accent\`, \`typography\`, and \`contentWidth\` in \`site.params\`. For your own colors, fonts, and styles, set \`site.theme\` to a theme directory (such as \`./theme\`) and set design tokens and stylesheets in its \`theme.json\`.

The default home page is \`site.landing: { source: './site/home.json' }\`. To design it freely in HTML, create \`site/home.html\` and use \`site.landing: { template: './site/home.html' }\`. Documents continue to use \`index.pmd\` in their own directories.

To publish on GitHub Pages, commit the project and the \`pnpm-lock.yaml\` created by installation, push to GitHub, and set Settings → Pages → Source to GitHub Actions. The included \`.github/workflows/pages.yml\` builds and publishes \`dist/web/\` on changes to \`main\`, or when run manually. The workflow sets the deployment path automatically. Follow GitHub Pages’ domain setup to use a custom domain.

## Editing

- In the browser: Presmium includes Studio (experimental); run \`presmium studio\` in this directory and open the address it prints. The workbench has pages, text, scripts, comments and version history; editing and previewing need no model. The version history lives in git, so this directory has to be a git repository (a new project runs git init).
- With an AI coding tool: open this directory in Claude Code, Codex or a similar tool and describe the change. \`AGENTS.md\` and \`.agents/skills\` explain the document and checks. The project's \`.mcp.json\` connects Claude Code launched from this directory to native MCP; configure Codex once with \`codex mcp add presmium -- presmium mcp <absolute-project-path>\`. \`presmium mcp\` starts or reuses the workspace service, with editing and captures available after initialization. Open \`presmium studio\` when an action needs a browser or approval window; automatic startup does not approve paid operations or source-file writes.
- \`index.pmd\` is read and written by tools and is not meant for editing by hand; run \`presmium check\` after a change to confirm the document is valid.

\`AGENTS.md\` and \`.agents/skills\` are for AI coding tools. Presmium: ${REPOSITORY}
`
      : kind === 'document'
      ? `# ${title}

A Presmium document: it is \`index.pmd\`, which Presmium exports to a web page, slides, and a
Notebook. The commands come from \`pnpm add -g @lincyaw/presmium\`; after \`pnpm install\` here, they are the
version \`package.json\` pins.

\`\`\`sh
presmium dev       # a live preview of the web page and the slides
presmium check     # checks the document: syntax, plugins, links
presmium build     # exports the web page, the slides, and the Notebook into dist/
\`\`\`

## Editing

- In the browser: Presmium includes Studio (experimental); run \`presmium studio\` in this directory and open the address it prints. The workbench has pages, text, scripts, comments and version history; editing and previewing need no model. The version history lives in git, so this directory has to be a git repository (a new project runs git init).
- With an AI coding tool: open this directory in Claude Code, Codex or a similar tool and describe the change. \`AGENTS.md\` and \`.agents/skills\` explain the document and checks. The project's \`.mcp.json\` connects Claude Code launched from this directory to native MCP; configure Codex once with \`codex mcp add presmium -- presmium mcp <absolute-project-path>\`. \`presmium mcp\` starts or reuses the workspace service, with editing and captures available after initialization. Open \`presmium studio\` when an action needs a browser or approval window; automatic startup does not approve paid operations or source-file writes.
- \`index.pmd\` is read and written by tools and is not meant for editing by hand; run \`presmium check\` after a change to confirm the document is valid.

\`AGENTS.md\` is for AI coding tools, with the skills in \`.agents/skills\`. Presmium: ${REPOSITORY}
`
      : `# ${title}

A Presmium workspace: the \`index.pmd\` of each subdirectory is a document (the first in \`intro/\`), and
\`presmium.workspace.yaml\` is the workspace’s configuration. The commands come from \`pnpm add -g @lincyaw/presmium\`;
after \`pnpm install\` here, they are the version \`package.json\` pins.

\`\`\`sh
presmium serve           # the documents and their live previews, on this machine
presmium check intro     # checks one document
presmium build           # exports the workspace as a website into dist/web/
\`\`\`

The Reader Q&A plugin the configuration lists lets readers “Ask”.

## Editing

- In the browser: Presmium includes Studio (experimental); run \`presmium studio\` in this directory and open the address it prints. The workbench has pages, text, scripts, comments and version history; editing and previewing need no model. The version history lives in git, so this directory has to be a git repository (a new project runs git init).
- With an AI coding tool: open this directory in Claude Code, Codex or a similar tool and describe the change. \`AGENTS.md\` and \`.agents/skills\` explain the document and checks. The project's \`.mcp.json\` connects Claude Code launched from this directory to native MCP; configure Codex once with \`codex mcp add presmium -- presmium mcp <absolute-project-path>\`. \`presmium mcp\` starts or reuses the workspace service, with editing and captures available after initialization. Open \`presmium studio\` when an action needs a browser or approval window; automatic startup does not approve paid operations or source-file writes.
- \`index.pmd\` is read and written by tools and is not meant for editing by hand; run \`presmium check\` after a change to confirm the document is valid.

\`AGENTS.md\` is for AI coding tools, with the skills in \`.agents/skills\`. Presmium: ${REPOSITORY}
`,
    agentsFile: (kind, title) => `# ${title}

${kind === 'document'
  ? 'This is a Presmium document: it is `index.pmd`, which `presmium` exports to a web page, slides, and a Notebook.'
  : kind === 'site'
  ? 'This is a Presmium website: its independent home page is `site/home.json`, selected by `site.landing.source` in `presmium.workspace.yaml`; `site.landing.template` can instead select `site/home.html`. The home page presents the brand and website sections. Content stays in each directory’s `index.pmd` (the first is `intro/index.pmd`), keeping content, steps, and presentations in one document.'
  : 'This is a Presmium workspace: the `index.pmd` of each subdirectory is a document, and `presmium.workspace.yaml` is the workspace’s configuration (the operator’s settings are in its `settings`, which no document changes).'} Change the documents and the code, never the output in \`dist/\`.

Skills (\`.agents/skills\`, self-contained):

- \`presmium-author\`: writing, presenting, and producing documents: how to write the reading and slide versions, pages, content blocks, steps and scripts, voiceover and lecture videos, the classroom, checks, exports, and publishing.
- \`presmium-animate\`: animation: the way to show each teaching moment, scenes written in code (with a gallery of effects for each animation library), and putting them on the voiceover.

When native MCP \`presmium\` is connected (\`.mcp.json\`, command \`presmium mcp\`), use its author actions directly for edits, checks and captures as “Work through the tools” in \`presmium-author\` says. The default command starts or reuses the workspace service before initialization. Use this project as the working directory or pass an absolute workspace or document path. Edit \`index.pmd\` directly only with explicit \`--compiler-only\` mode or without an MCP host. After an interruption, inspect saved history or task state before repeating a write with an unknown outcome. Automatic startup preserves approvals for paid operations, source-file writes and browser control.

After a change, run \`${kind === 'document' ? 'presmium check' : 'presmium check <document directory>'}\` and fix what it reports; \`presmium build\` exports ${kind === 'document' ? 'the web page, the slides, and the Notebook' : 'the workspace’s website'}.
`,
  },
}

