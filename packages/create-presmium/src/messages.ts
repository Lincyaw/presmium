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
  site: Record<'lang' | 'description' | 'kicker' | 'summary' | 'start' | 'featuresTitle' | 'learnTitle' | 'learnBody' | 'publishTitle' | 'publishBody' | 'personalTitle' | 'personalBody' | 'documentsTitle' | 'guideTitle' | 'guideIntro' | 'guideStartTitle' | 'guideStartBody' | 'guideStyleTitle' | 'guideStyleBody' | 'guidePublishTitle' | 'guidePublishBody', string>
  readme(kind: 'lecture' | 'workspace' | 'site', title: string): string
  agentsFile(kind: 'lecture' | 'workspace' | 'site', title: string): string
}

const REPOSITORY = 'https://github.com/Lincyaw/presmium'

export const MESSAGES: Record<Locale, Messages> = {
  'zh-CN': {
    usage: `用法：presmium new [<目录>] [<选项>]（或 pnpm create presmium [<目录>] [<选项>]）

在 <目录> 中新建一个 Presmium 项目；没有给出 --type 或目录时逐项询问。

选项：
  --type <种类>    lecture（一份讲义）、workspace（多份文稿）、site（带首页与发布流程的网站）
                   或 plugin（插件：指令、两种形态共用的组件与服务端路由）
  --theme <主题>   site 的主题：course、docs 或 showcase（默认 course）
  --title <标题>   讲义、工作区或网站的标题（默认为目录名）
  --name <包名>    插件的包名（默认为目录名）
  --no-git         不运行 git init
  -h, --help       显示本说明`,
    kindQuestion: '新建哪种项目？',
    kinds: {
      lecture: '讲义：一份文稿，导出为网页、幻灯片与 Notebook',
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
    badKind: kind => `没有“${kind}”这种项目。请选择 lecture、workspace、site 或 plugin。`,
    badTheme: theme => `没有“${theme}”这种主题。请选择 course、docs 或 showcase。`,
    themeOnlyForSite: '--theme 只用于网站。请同时指定 --type site。',
    badName: name => `“${name}”不能用作包名。请只用小写字母、数字与 - . _，可以带 @作用域/。`,
    notEmpty: dir => `${dir} 已存在且不是空目录。请换一个目录，或先清空它。`,
    created: (kind, dir) => `已在 ${dir} 新建${kind === 'lecture' ? '讲义' : kind === 'workspace' ? '工作区' : kind === 'site' ? '网站' : '插件'}。`,
    next: '接下来：',
    agents: '给 AI 编程工具的说明：AGENTS.md 与 .agents/skills 中的技能。',
    firstDocument: '第一讲',
    site: {
      lang: 'zh-CN',
      description: '用文稿构建课程、文档与作品网站。',
      kicker: '让知识被更多人看见',
      summary: '把文章、演示与学习资料放在同一个地方。从第一篇内容开始，逐步构建属于你的网站。',
      start: '开始阅读',
      featuresTitle: '为你的内容而设计',
      learnTitle: '把知识讲清楚',
      learnBody: '用章节组织思路，让读者跟随内容深入。每份文稿都有可以直接访问的独立地址。',
      publishTitle: '随时发布',
      publishBody: '导出完整静态网站，在 GitHub Pages 发布，让读者通过浏览器直接访问。',
      personalTitle: '呈现你的风格',
      personalBody: '选择课程、文档或展示主题，再调整配色、字体与阅读宽度。内容始终由你掌握。',
      documentsTitle: '开始探索',
      guideTitle: '开始创作',
      guideIntro: '这是你的第一份内容文稿。用自己的文字替换它，再添加更多章节和素材。',
      guideStartTitle: '写下第一篇内容',
      guideStartBody: '网站首页单独编排，课程文章保存在教学文稿中。替换示例内容，再在新的子目录中新建文稿，具体文件与命令见项目的 README。',
      guideStyleTitle: '选择网站主题',
      guideStyleBody: '在 presmium.workspace.yaml 的 site 中设置 theme：course 适合课程，docs 适合文档，showcase 适合展示作品。params 可以调整 accent、typography 和 contentWidth；theme 写成主题目录（如 ./theme）时，可以自定义配色、字体与样式。',
      guidePublishTitle: '发布你的网站',
      guidePublishBody: '导出网站后，静态产物在 dist/web/。将项目推送到 GitHub，并在仓库的 Pages 设置中选择 GitHub Actions，项目附带的工作流会在 main 分支更新时导出和发布。',
    },
    readme: (kind, title) => kind === 'site'
      ? `# ${title}

一个 Presmium 网站：独立网站首页保存在 \`site/home.json\`，第一份教学文稿在 \`intro/lecture.json\`。首页负责品牌介绍、行动按钮与网站板块；教学文稿负责正文、步骤和放映。\`presmium.workspace.yaml\` 的 \`site\` 配置主题、个性化参数、导航与首页入口。

\`\`\`sh
pnpm install
pnpm serve     # 本地实时预览
pnpm check     # 检查教学文稿
pnpm build     # 导出网站到 dist/web/
\`\`\`

在 \`site.theme\` 中选择 \`course\`、\`docs\` 或 \`showcase\`，在 \`site.params\` 中调整 \`accent\`、\`typography\` 与 \`contentWidth\`。需要自己的配色、字体与样式时，把 \`site.theme\` 写成主题目录（如 \`./theme\`），在其中的 \`theme.json\` 中设置设计令牌与样式表。

默认首页入口是 \`site.landing: { source: './site/home.json' }\`。需要自行设计 HTML 首页时，创建 \`site/home.html\` 并改为 \`site.landing: { template: './site/home.html' }\`；教学文稿继续使用各目录中的 \`lecture.json\`。

发布到 GitHub Pages：提交项目与安装生成的 \`pnpm-lock.yaml\`，推送到 GitHub 仓库，在 Settings → Pages 中将 Source 设为 GitHub Actions。\`.github/workflows/pages.yml\` 在 \`main\` 分支更新时构建并发布 \`dist/web/\`，也可以手动运行。部署路径由工作流自动设置；使用自定义域名时，按 GitHub Pages 的说明配置域名。

## 编辑

- 在浏览器中编辑：运行 \`pnpm add -g @lincyaw/studio\` 安装 Presmium Studio（实验版，约 865 MB），在本目录运行 \`presmium-studio\`，打开终端打印的网址。工作台提供页面、正文、讲稿、批注与版本历史；编辑和预览都不需要配置模型。版本历史记录在 git 中，所以本目录需要是一个 git 仓库（新建时会自动运行 git init）。
- 交给 AI 工具：在 Claude Code、Codex 等工具中打开本目录，用自然语言描述要改的内容。\`AGENTS.md\` 与 \`.agents/skills\` 中的技能说明了文稿的结构与检查方法。
- \`lecture.json\` 由工具读写，不适合手工编辑；修改后运行 \`presmium check\` 确认文稿有效。

\`AGENTS.md\` 与 \`.agents/skills\` 是给 AI 编程工具的说明。Presmium：${REPOSITORY}
`
      : kind === 'lecture'
      ? `# ${title}

一份 Presmium 讲义：文稿保存在 \`lecture.json\` 中，Presmium 把它导出为网页、幻灯片与 Notebook。命令来自 \`pnpm add -g @lincyaw/presmium\`；在本目录运行 \`pnpm install\` 之后，用的是 \`package.json\` 锁定的版本。

\`\`\`sh
presmium dev       # 实时预览网页与幻灯片
presmium check     # 检查讲义：语法、插件、链接
presmium build     # 导出网页、幻灯片与 Notebook，产物在 dist/
\`\`\`

## 编辑

- 在浏览器中编辑：运行 \`pnpm add -g @lincyaw/studio\` 安装 Presmium Studio（实验版，约 865 MB），在本目录运行 \`presmium-studio\`，打开终端打印的网址。工作台提供页面、正文、讲稿、批注与版本历史；编辑和预览都不需要配置模型。版本历史记录在 git 中，所以本目录需要是一个 git 仓库（新建时会自动运行 git init）。
- 交给 AI 工具：在 Claude Code、Codex 等工具中打开本目录，用自然语言描述要改的内容。\`AGENTS.md\` 与 \`.agents/skills\` 中的技能说明了文稿的结构与检查方法。
- \`lecture.json\` 由工具读写，不适合手工编辑；修改后运行 \`presmium check\` 确认文稿有效。

\`AGENTS.md\` 是给 AI 编程工具的说明，技能在 \`.agents/skills\`。Presmium：${REPOSITORY}
`
      : `# ${title}

一个 Presmium 工作区：每个子目录中的 \`lecture.json\` 是一份文稿（第一份在 \`intro/\`），\`presmium.workspace.yaml\` 是工作区的配置。命令来自 \`pnpm add -g @lincyaw/presmium\`；在本目录运行 \`pnpm install\` 之后，用的是 \`package.json\` 锁定的版本。

\`\`\`sh
presmium serve           # 文稿列表与各文稿的实时预览，只在本机
presmium check intro     # 检查一份文稿
presmium build           # 把工作区导出为网站，产物在 dist/web/
\`\`\`

工作区配置中列出的读者问答插件让读者可以“提问”。

## 编辑

- 在浏览器中编辑：运行 \`pnpm add -g @lincyaw/studio\` 安装 Presmium Studio（实验版，约 865 MB），在本目录运行 \`presmium-studio\`，打开终端打印的网址。工作台提供页面、正文、讲稿、批注与版本历史；编辑和预览都不需要配置模型。版本历史记录在 git 中，所以本目录需要是一个 git 仓库（新建时会自动运行 git init）。
- 交给 AI 工具：在 Claude Code、Codex 等工具中打开本目录，用自然语言描述要改的内容。\`AGENTS.md\` 与 \`.agents/skills\` 中的技能说明了文稿的结构与检查方法。
- \`lecture.json\` 由工具读写，不适合手工编辑；修改后运行 \`presmium check\` 确认文稿有效。

\`AGENTS.md\` 是给 AI 编程工具的说明，技能在 \`.agents/skills\`。Presmium：${REPOSITORY}
`,
    agentsFile: (kind, title) => `# ${title}

${kind === 'lecture'
  ? '这是一份 Presmium 讲义：文稿是 `lecture.json`，`presmium` 把它导出为网页、幻灯片与 Notebook。'
  : kind === 'site'
  ? '这是一个 Presmium 网站：独立首页在 `site/home.json`，由 `presmium.workspace.yaml` 的 `site.landing.source` 指定；也可以通过 `site.landing.template` 使用 `site/home.html`。首页自由编排品牌介绍和网站板块，教学内容始终写在各目录的 `lecture.json`（第一份为 `intro/lecture.json`），保持教学文稿、步骤与放映的同一内容入口。'
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
  --type <kind>    lecture (one document), workspace (documents), site (a home page and publishing),
                   or plugin (a directive, a component of both forms, and a server route)
  --theme <name>   site theme: course, docs, or showcase (default: course)
  --title <text>   the lecture, workspace, or site title (default: the directory’s name)
  --name <name>    the plugin’s package name (default: the directory’s name)
  --no-git         do not run git init
  -h, --help       show this help`,
    kindQuestion: 'Which project?',
    kinds: {
      lecture: 'lecture: one document, as a web page, slides, and a Notebook',
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
    badKind: kind => `There is no project “${kind}”. Choose lecture, workspace, site, or plugin.`,
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
      kicker: 'A place to share what you know',
      summary: 'Bring explanations, demonstrations, and learning resources together. Start with your first article and create a site that feels like yours.',
      start: 'Start Reading',
      featuresTitle: 'Made for your content',
      learnTitle: 'Make Ideas Clear',
      learnBody: 'Organize your ideas into chapters and let readers explore. Every document has an address you can share.',
      publishTitle: 'Ready to share',
      publishBody: 'Export a complete static website and publish it on GitHub Pages so readers can visit directly in their browser.',
      personalTitle: 'Make It Yours',
      personalBody: 'Choose a course, documentation, or showcase template, then adjust the accent, typography, and reading width.',
      documentsTitle: 'Explore the Documents',
      guideTitle: 'Start Creating',
      guideIntro: 'This is your first document. Replace it with your own words, then add more chapters and resources.',
      guideStartTitle: 'Write your first article',
      guideStartBody: 'Design your website home page separately from the teaching documents that hold your articles. Replace the sample content, then add documents in new subdirectories. The project’s README lists the files and commands.',
      guideStyleTitle: 'Choose Your Site Style',
      guideStyleBody: 'Set theme under site in presmium.workspace.yaml: course for courses, docs for documentation, or showcase for your projects. Use params to adjust accent, typography, and contentWidth; set theme to a theme directory (such as ./theme) for your own colors, fonts, and styles.',
      guidePublishTitle: 'Share Your Site',
      guidePublishBody: 'Export your site into dist/web/. Push the project to GitHub and choose GitHub Actions in the repository’s Pages settings. The included workflow exports and publishes changes to main.',
    },
    readme: (kind, title) => kind === 'site'
      ? `# ${title}

A Presmium site: the independent website home page is \`site/home.json\`, and your first teaching document is \`intro/lecture.json\`. The home page presents your brand, actions, and website sections; teaching documents hold the content, steps, and presentation. The \`site\` section of \`presmium.workspace.yaml\` sets the theme, appearance parameters, navigation, and home page.

\`\`\`sh
pnpm install
pnpm serve     # a live local preview
pnpm check     # checks the teaching document
pnpm build     # exports the website into dist/web/
\`\`\`

Choose \`course\`, \`docs\`, or \`showcase\` in \`site.theme\`. Adjust \`accent\`, \`typography\`, and \`contentWidth\` in \`site.params\`. For your own colors, fonts, and styles, set \`site.theme\` to a theme directory (such as \`./theme\`) and set design tokens and stylesheets in its \`theme.json\`.

The default home page is \`site.landing: { source: './site/home.json' }\`. To design it freely in HTML, create \`site/home.html\` and use \`site.landing: { template: './site/home.html' }\`. Teaching documents continue to use \`lecture.json\` in their own directories.

To publish on GitHub Pages, commit the project and the \`pnpm-lock.yaml\` created by installation, push to GitHub, and set Settings → Pages → Source to GitHub Actions. The included \`.github/workflows/pages.yml\` builds and publishes \`dist/web/\` on changes to \`main\`, or when run manually. The workflow sets the deployment path automatically. Follow GitHub Pages’ domain setup to use a custom domain.

## Editing

- In the browser: install Presmium Studio (experimental, about 865 MB) with \`pnpm add -g @lincyaw/studio\`, run \`presmium-studio\` in this directory and open the address it prints. The workbench has pages, text, scripts, comments and version history; editing and previewing need no model. The version history lives in git, so this directory has to be a git repository (a new project runs git init).
- With an AI coding tool: open this directory in Claude Code, Codex or a similar tool and describe the change in plain words. \`AGENTS.md\` and the skills in \`.agents/skills\` explain the document's structure and how to check it.
- \`lecture.json\` is read and written by tools and is not meant for editing by hand; run \`presmium check\` after a change to confirm the document is valid.

\`AGENTS.md\` and \`.agents/skills\` are for AI coding tools. Presmium: ${REPOSITORY}
`
      : kind === 'lecture'
      ? `# ${title}

A Presmium lecture: the document is \`lecture.json\`, which Presmium exports to a web page, slides, and a
Notebook. The commands come from \`pnpm add -g @lincyaw/presmium\`; after \`pnpm install\` here, they are the
version \`package.json\` pins.

\`\`\`sh
presmium dev       # a live preview of the web page and the slides
presmium check     # checks the lecture: syntax, plugins, links
presmium build     # exports the web page, the slides, and the Notebook into dist/
\`\`\`

## Editing

- In the browser: install Presmium Studio (experimental, about 865 MB) with \`pnpm add -g @lincyaw/studio\`, run \`presmium-studio\` in this directory and open the address it prints. The workbench has pages, text, scripts, comments and version history; editing and previewing need no model. The version history lives in git, so this directory has to be a git repository (a new project runs git init).
- With an AI coding tool: open this directory in Claude Code, Codex or a similar tool and describe the change in plain words. \`AGENTS.md\` and the skills in \`.agents/skills\` explain the document's structure and how to check it.
- \`lecture.json\` is read and written by tools and is not meant for editing by hand; run \`presmium check\` after a change to confirm the document is valid.

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

The Reader Q&A plugin the configuration lists lets readers “Ask”.

## Editing

- In the browser: install Presmium Studio (experimental, about 865 MB) with \`pnpm add -g @lincyaw/studio\`, run \`presmium-studio\` in this directory and open the address it prints. The workbench has pages, text, scripts, comments and version history; editing and previewing need no model. The version history lives in git, so this directory has to be a git repository (a new project runs git init).
- With an AI coding tool: open this directory in Claude Code, Codex or a similar tool and describe the change in plain words. \`AGENTS.md\` and the skills in \`.agents/skills\` explain the document's structure and how to check it.
- \`lecture.json\` is read and written by tools and is not meant for editing by hand; run \`presmium check\` after a change to confirm the document is valid.

\`AGENTS.md\` is for AI coding tools, with the skills in \`.agents/skills\`. Presmium: ${REPOSITORY}
`,
    agentsFile: (kind, title) => `# ${title}

${kind === 'lecture'
  ? 'This is a Presmium lecture: the document is `lecture.json`, which `presmium` exports to a web page, slides, and a Notebook.'
  : kind === 'site'
  ? 'This is a Presmium website: its independent home page is `site/home.json`, selected by `site.landing.source` in `presmium.workspace.yaml`; `site.landing.template` can instead select `site/home.html`. The home page presents the brand and website sections. Teaching content stays in each directory’s `lecture.json` (the first is `intro/lecture.json`), keeping content, steps, and presentations in one teaching document.'
  : 'This is a Presmium workspace: the `lecture.json` of each subdirectory is a document, and `presmium.workspace.yaml` is the workspace’s configuration (the operator’s settings are in its `settings`, which no document changes).'} Change the documents and the code, never the output in \`dist/\`.

Skills (\`.agents/skills\`, self-contained):

- \`presmium-author\`: writing and changing documents: document entities, pages, content blocks, steps and scripts, checks, and exports.
- \`presmium-animate\`: animation: the way to show each teaching moment, scenes written in code (with a gallery of effects for each animation library), and putting them on the voiceover.
- \`presmium-present\`: presenting, the Presenter View, the classroom, and lectures.

After a change, run \`${kind === 'lecture' ? 'presmium check' : 'presmium check <document directory>'}\` and fix what it reports; \`presmium build\` exports ${kind === 'lecture' ? 'the web page, the slides, and the Notebook' : 'the workspace’s website'}.
`,
  },
}

