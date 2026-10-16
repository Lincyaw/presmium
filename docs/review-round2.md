# 第二轮评审修复清单（WP-70）

本清单汇总第二轮整体评审，评审对象是 `main` cbf87d9（当前 0092d88 只多了文档、技能与 `scripts/check-skills.mjs`）。输入是 5 份需求验收报告（内核、插件 A、插件 B、媒介与编辑、体验，共 62 个缺口）和 6 份代码评审报告（复用、抽象层次、简化与效率两份、正确性两份，共 90 条），另加 `docs/wbs.md` 中 WP-70 要求一并处理的 `architecture.md` 第 9 节遗留。合并重复后保留 116 项（30 个主要、86 个次要），2 项转为待决定，3 条部分内容删除（见文末）。

合并的原则是保留根因修法。主要的合并有：共享状态的三套实现（内核 K-06、复用、抽象层次、简化、插件 B 的 P-61 黑屏）合为 R-08；各包各判界面语言与编译时文稿语言（复用、抽象层次两条、插件简化、核心简化、插件评审的练习中文）合为 R-01；网页中聚光灯与提示看不到说明（插件 A 的 P-31/P-32 与体验报告）合为 R-09；组件自包装 `PmBoundary`（复用与抽象层次）合为 R-13；exec 的幻灯片扩展与“组件内代码”规则合为 R-29；classroom 的 notebook 扩展合为 R-23；三处本地资源处理与幻灯片预加载 404 合为 R-06；代码来源栏两份实现与多版本永久链接合为 R-56；脚注的文件作用域与编号显示合为 R-04；课堂成员身份的三个症状合为 R-19；课堂服务端的 pending 更新与拒绝后污染合为 R-20。

抽查确认的事实：`compiler/src/blocks.ts:260-263` 的 `codeOf` 只拆 `code` 与 `container`；`renderers.ts:94,246` 把原始 IR 写到 `<out>/ir.json`；`renderers.ts:164-170` 每次防抖都在 `running` 上追加一次编译；`sections.ts:67-73` 在一个循环中按源码顺序分配标签与 slug；`host/src/boundary.ts` 的 `failed` 从不清除；`viewer/src/markdown.ts:214-216` 只要有原始 HTML 子节点就整体写 `innerHTML`；`present.ts` 的 `useFit` 只比较高度；`BLOCK_CONTEXT` 只有提供方；viewer 依赖 katex 0.16.47 而 mermaid 12.2.0 要求 `^0.18.0`；`web/src/client/theme.ts:130` 去掉查询参数后不写回；`SessionBadge.vue` 为 `position: fixed; bottom: 1rem; right: 1rem; z-index: 2000`；exec 的 `slidesTag`、`fence` 没有 `codeLang`；classroom 的 notebook 扩展写死“**练习**”；exec-local 的 `runRequest` 不读 `files` 且 `DEFAULT_PRIORITY = 10`；18 个组件自包装 `PmBoundary`；`render-slides` 的 `extensionFor` 只按名字匹配而 notebook 要求 `node.plugin` 一致；`addon-code/src/node/resolve.ts:95` 用 `ctx.config`；只有 `render-notebook/src/node/presmium.ts` 出现 `kernel:`（指 Jupyter 内核）；`check-layering.mjs` 的 `except: ['addon-core', 'web']` 与只匹配 `ts|vue|mts|mjs|js|cjs` 的文件正则；语言服务的 `BUILTIN_DIRECTIVES` 没有 `config`；`addon-core/style.css:1-4` 仍隐藏 `[doc-only]`。没有发现与代码不符的报告条目。

工作包按包目录划分，可以在并行的工作树中实现：WP-70a 拥有内核、编译器、CLI、两个 Node 渲染端与编辑器工具；WP-70b 拥有宿主、两个宿主适配、IR 运行时、舞台与引导插件；WP-70c 拥有课堂、会话、内容、发布插件与课堂服务；WP-70d 拥有执行与代码插件、文档、示例讲义、脚本与技能。探针脚本在 `/tmp/claude-1000/-home-ddq-AoyangSpace-presmium/ad4777b2-3f0f-4adb-9e14-744177671948/scratchpad/` 的各报告子目录中，下文只写结论。

## 组间约定

**C-1 合并顺序、依赖与技能。** 70a 先合并；70b、70c 其次（二者之间只有 C-9、C-21 的接口依赖，按约定签名编写即可）；70d 最后合并，因为它拥有文档、结构检查与技能。各组按本节的签名编写，合并前变基到 70a。新增依赖（viewer 的 `hast-util-raw`、`shiki-magic-move`，katex 改为 0.18.10，render-slides 依赖 `@presmium/viewer`，classroom 删除 `myst-to-md`、`vfile`，addon-code 删除 `@presmium/host`、`vue`）写在合并说明中，合并时重新生成 `pnpm-lock.yaml`。只有 70d 修改 `docs/` 与 `.agents/skills`；其他组在合并说明中写明作者可见的变化，由 70d 写入（C-24）。

**C-2 文稿语言（R-01）。** 70a：kernel 导出 `deckLocale(lang?: string): Locale`（`localeOf(lang || DEFAULT_LANG) ?? 'en'`）；编译器只从头部 `lang` 解析文稿语言并总是写入 `meta.lang`（`renderers.web.lang` 不再覆盖它）；`DirectiveContext`、`PassContext`、`RenderContext` 增加可选 `lang: string`。浏览器端一律用 `@presmium/host` 已有的接口：组件内 `useMessages(CATALOG)`，组件外 `CATALOG[currentLocale()]`，删除各包自己的 `detect`、`localeOf`、`stageLocale` 与对 `<html lang>` 的 MutationObserver。各组迁移自己的包：70b 为 viewer（删除 `domain/messages.ts` 中自己的 `localeOf`、`Locale`，改用 kernel 的）、addon-stage、addon-guide（聚光灯降级文本按 `ctx.lang`）；70c 为 addon-session、addon-classroom（places 步骤与 notebook 单元按 `ctx.lang`）、addon-content（PlantUML alt）、addon-publish；70d 为 addon-exec、addon-exec-local。

**C-3 kernel 中的共用纯函数（R-07、R-41、R-104）。** 70a 从 `@presmium/kernel` 导出 `irBlocks(blocks)`、`docBlocks(doc)`（产生 `{ section, block }`，递归进入组件子块与 fallback）、`errorMessage`、`isRecord`、`failedRun(executorId, stderr, durationMs)`、`languageId(lang)`（小写，`py`、`python3`、`ipython*` 归为 `python`，`js`、`mjs` 归为 `javascript`，`ts` 归为 `typescript`）与 `lowerMyst(mdast, { links })`。各组替换自己包中的副本。

**C-4 组件隔离（R-13、R-14、R-33）。** 70a：render-slides 在每个插件组件外（包括扩展输出与 `PmStaticFallback`）写 `<PmBoundary name="组件名">`；扩展抛错时在块位置报告警告并退回组件标签或 fallback。70b：`PmBoundary` 增加 `resetKey` 属性。各组删除组件模板里的自包装：70b 为 addon-core 的 4 个夹具组件与 addon-guide 的 3 个；70c 为 addon-classroom 4 个、addon-content 3 个、addon-publish 1 个；70d 为 addon-exec 2 个、addon-exec-local 1 个。

**C-5 组件拥有的代码（R-29）。** 规则：组件内的代码块不显示运行控件与录制输出（网页已由 viewer 的 `IN_COMPONENT` 实现）。70a：render-slides 的 `tag()` 告诉 `code()` 该代码块属于组件，不写 outputs，照常做 `codeLang` 映射。70d：删除 exec 的 `PmRunPanel`、`PmStepRun` 幻灯片扩展。

**C-6 notebook 扩展返回 mdast（R-23）。** 70a：`NotebookCellInput` 增加 `{ cell_type: 'markdown', mdast: MdastNode }`，渲染端把它送入自己的 `lower`、本地媒体复制与降级记录。70c：classroom 使用它。

**C-7 本地资源（R-06、R-64、R-65）。** 70a：`RenderContext` 增加 `localAsset(source: SourcePos, url: string): { file: string, name: string } | undefined`：相对块所在文件解析 URL（解码失败时保留原文），文件存在时返回绝对路径与发布名 `<内容哈希前 8 位>-<文件名>`。`ComponentNode` 增加可选 `assets?: Record<string, string>`（属性名到本地 URL），渲染端发布这些文件并改写对应属性。render-slides 把文件复制到生成项目的 `public/` 并以带 base 的根路径引用；render-notebook 复制到 `media/`。70b：web 的 `publishedDocument` 对 image、link、definition 都改用 `localAsset`。70c：`PmMedia` 改为声明 `assets`，删除 `mediaMdast` 与 `slidesMedia`。

**C-8 开发服务器的 Vite 插件（R-25）。** 70a：`PresmiumNodePlugin` 增加可选 `vitePlugins?: (ctx: { deckDir: string, workspaceRoot: string, config: Record<string, unknown> }) => unknown[]`（kernel 不引入 vite 类型），编译器收集到 `RenderContext.vitePlugins`。70b：web 在开发与构建中把它们加入 VitePress 的 `vite.plugins`。70d：exec-local 从 `./presmium` 返回 `localEnvServer`；幻灯片形态保留 `setup/vite-plugins.ts` 作为薄适配。

**C-9 共享状态与覆盖视图（R-08、R-18、R-91）。** 70b：viewer 删除 `Viewer.shared/share` 与 `hello`、`shared` 消息，位置通道名用 `deckChannel`，窗口加入用 host 的 `joinWindows`；舞台的画面状态在两种形态都用 `useSharedState('presmium.stage.screen', 'live', { scope: 'remote' })`；覆盖视图（present、presenter）的根元素设置 CSS 变量 `--pm-overlay-bar`（控制条高度）。70c：`SessionBadge` 用 `bottom: calc(var(--pm-overlay-bar, 0px) + 1rem)`，并在 session.spec 断言网页形态的黑屏到达学员。

**C-10 代码来源栏（R-56、R-109）。** 70b：`@presmium/viewer/domain` 导出纯函数 `originParts(node, shown, locale)` 与 `outputNotes(run, locale)` 及其 zh-CN、en 文本。70a：kernel 的 `CodeVariant` 增加可选 `startLine`、`endLine`；render-slides 依赖 `@presmium/viewer`（只用 `./domain`）生成来源栏。70d：addon-code 为每个版本写入行号，并在 code.spec 断言每步的文件链接与行范围。

**C-11 脚注（R-04）。** 70a：编译器让脚注 `identifier` 在文稿内唯一（后出现的文件中重复的改名，`label` 不变），并给 `footnoteReference`、`footnoteDefinition` 写 `enumerator`（每份文稿按首次引用顺序从 1 起）。70b：viewer 显示 `enumerator`，舞台的脚注步骤不需改动。

**C-12 插件声明（R-111）。** 各组给自己包的 Node 插件（`./presmium`）加 `version`（与 package.json 一致）与 `kernel: '^0.1.0'`：70a 为 render-slides、render-notebook；70b 为 addon-core、addon-stage、addon-guide、web；70c 为 addon-session、addon-classroom、addon-content、addon-publish；70d 为 addon-exec、addon-exec-local、addon-code。结构检查由 70d 加入，随 70d 最后合并。

**C-13 默认 base（R-10）。** 同时构建网页与幻灯片且都未设 base 时，70b 让网页默认 `/web/`，70a 让幻灯片默认 `/slides/`，两边的互跳链接都由这两个值计算；只构建一种形态时默认仍为 `/`。

**C-14 渲染上下文中的插件目录（R-42）。** 70a：`RenderContext` 增加 `pluginDirs: Record<string, string>`、绑定好的 `extensionFor(node)`（`node.plugin` 存在时只匹配该插件）与 `portable(value, from)`。70b：web 的 `addons.ts`、`publish.ts` 改用它们。

**C-15 覆盖层组件（R-51）。** 70a：`ComponentNode` 增加可选 `layer?: 'overlay'`；render-slides 对没有 fallback 的覆盖层组件不写空的 `PmStaticFallback`。70b：addon-guide 的指令设置它，viewer 把覆盖层块放到板块之外。

**C-16 只生成工作目录（R-95）。** 70a：kernel 的 `Renderer` 增加可选 `prepare?(doc, ctx)`，render-slides 用现有的 `writeDeck` 实现它，`build` 先调用它；编译器在 `build` 旁导出 `prepare(compilation, { to, outDir })`。70c：发布插件使用。

**C-17 执行之后的插件步骤（R-106）。** 70a：`IRPass` 增加可选 `after?: 'execute'`，编译器在编译时执行之后运行这类步骤。70d：执行插件在该阶段写入 fallback。

**C-18 滚动叙事中的组件内部步骤（R-28）。** 70b：滚动叙事中没有讲解的步骤（组件内部步骤）每步只占 25vh。70d：`PmStepRun` 的本地步进器。

**C-19 e2e 助手与夹具（R-77）。** 70b 只给 `e2e/fixtures/deck.ts` 增加导出（`deckDir`、`startDev`、`openSlide`、带 `closeAllConnections` 的 `serve`、`buildFixture` 的 `link` 与 `bases` 选项），不改现有签名；其他组可以在自己的 spec 中采用。跨组只读使用的夹具：`e2e/preview.spec.ts`（70a）用 `e2e/fixtures/plugins/preview`（70c）；`e2e/perf.spec.ts`（70b）用 `e2e/fixtures/exec`（70d）；R-91（70c）引用 `e2e/fixtures/core` 的夹具插件。需要改动别组夹具时在合并说明中提出。

**C-20 CLI 测试助手（R-43）。** 70a：`@presmium/cli` 导出 `./testing` 的 `presmium(cwd, args, env?)`（默认删除 `NODE_ENV`，maxBuffer 足够大）。各组把自己包的测试改用它。

**C-21 会话快照助手（R-89）。** 70b：`@presmium/host` 导出 `useSessionSnapshot()`（在 SESSION 服务上的 watchEffect 加 subscribe）与 `claimFirst(group: string)`。70c：session 与 classroom 改用。

**C-22 锚点参数（R-44）。** 70a：`DirectiveSpec` 增加可选 `arg?: 'anchor'`，语言服务据此识别锚点参数，删除写死的 `code-ref`。70d：addon-code 的 `{code-ref}` 声明它。

**C-23 幻灯片中的 iframe（R-54）。** 70a：render-slides 把 mdast `iframe` 写成 `<iframe src width height loading="lazy">`（在 figure 内）。70b：viewer 渲染同样的元素。

**C-24 文档。** 70d 按各项的修法写入：ir.md（`{code-cell}` 与 `:run:`、组件内代码规则、`{config}` 示例与实际读取的选项、渲染端选项 base、port、slidesUrl、webUrl、`renderers.notebook.webUrl` 与 C-13 的默认值、`dist/ir.json` 为相对路径而 `presmium ir` 输出绝对路径、锚点路径基准、two-cols 示例、check 与 dev 的选项、`presmium-export --format`、文稿本地组件）；architecture.md（4.4 共享状态与课堂写入规则、5.1 视图插件成员与 `vitePlugins`、5.4 渲染端包裹组件、5.7 文稿语言与框架英文界面的限制、5.9 组件拥有的代码、第 9 节）；requirements、wbs、browsers.md；`.agents/skills` 三个技能。70a 在 kernel 的 `ClassroomStore` 上补一行 JSDoc 写明课堂写入规则（R-20）。

## WP-70a（编译管线、渲染端与编辑器）

拥有：`packages/kernel`、`packages/compiler`、`packages/cli`、`packages/render-slides`、`packages/render-notebook`、`packages/language-server`、`packages/vscode`、`e2e/preview.spec.ts`

本组在约定中提供的接口：C-2、C-3、C-4（render-slides 部分）、C-5（render-slides 部分）、C-6、C-7、C-8、C-10（kernel 与 render-slides 部分）、C-11、C-13（幻灯片默认 base）、C-14、C-15、C-16、C-17、C-20、C-22、C-23；C-12 中本组的两个包。

### R-01（major；N-07、K-07，复用与抽象层次）

**问题**：界面语言与文稿语言由各包自行判断，结果互相矛盾。浏览器端，classroom、session、content 把不认识的语言当作 zh-CN，stage 把非中文一律当作英文，exec、exec-local、publish 各复制了一份 `detect` 与对 `<html lang>` 的 MutationObserver（连同 host 共 6 个观察器），viewer 还有一个语义不同的 `localeOf`。编译时，三个上下文都不带文稿语言：guide 的聚光灯降级文本用全角冒号拼接，classroom 的 notebook 单元写死中文，classroom places 与 content PlantUML 从 `doc.meta` 自取，render-notebook 用自己的 `!/^zh\b/i`，web 让 `renderers.web.lang` 覆盖 `meta.lang`。`lang: fr` 的文稿里 host、viewer、exec、publish 显示英文，session、classroom、content 显示中文；`lang: en-US` 文稿的 notebook 出现“**练习**”。

**证据**：`addon-classroom/src/client/locale.ts:6`、`addon-exec/src/client/messages.ts:71-97`、`viewer/src/domain/messages.ts:134-139`、`render-notebook/src/domain/notebook.ts:108`、`render-slides/src/node/slidev.ts:82-84`、`addon-guide/src/node/presmium.ts:32`、`web/src/domain/config.ts:70`。探针：`<html lang=fr>` 加 navigator fr-FR 时 host、exec、publish 得 en，classroom、session、content 得 zh-CN；html=de 加 navigator zh-CN 时 stage 得 en、其余得 zh-CN。host 已导出 `currentLocale`、`useLocale`、`useMessages`（`host/src/index.ts:20`）。

**修法与验收**：按 C-2。本组实现 kernel 的 `deckLocale`、编译器的语言解析与三个上下文的 `lang`，render-slides 与 render-notebook 改用 `deckLocale(ctx.lang)`。验收：cli/test 加一份 `lang: fr` 文稿，断言幻灯片界面文字与 notebook 说明为英文、`meta.lang` 为 fr；各组为自己的包加 `lang: fr` 断言（70b web.spec、70c classroom.spec 与 notebook.test、70d exec.spec）；合并后 `grep -rn MutationObserver packages/*/src/client/messages.ts packages/*/src/client/locale.ts` 无结果。

### R-02（major；K-17、K-19，ir.md 5.1）

**问题**：`{code-cell}` 编成包着 MyST notebook `block` 与 `outputs` 的 markdown 块：`:run:` 被静默忽略，没有执行、输出或诊断；`outputs` 节点带随机 nanoid，同一提交两次编译的 IR 不同，并被发布到 `dist/web/ir.json`；notebook 中成为 Markdown 围栏，构建报告还出现令人费解的“no Jupyter form for outputs”。

**证据**：`compiler/src/blocks.ts:260-263` 的 `codeOf` 只拆 `code` 与 `container`。两次 `presmium ir` 只在 `ir.json:624` 的 outputs id 处不同。`grep code-cell` 找不到测试。

**修法与验收**：`codeOf` 也拆 `node.type === 'block'`（kind notebook-code），取其 `code` 子节点并丢弃 `outputs`；`clean()` 在任何位置去掉 MyST 的 `outputs` 节点，IR 不再携带随机 id。cli/test/ir.test.ts：```` ```{code-cell} python ```` 带 `:run:` 得到 `code` 节点、`run.when` 为 compile 且有输出，两次 `presmium ir` 字节相同。

### R-03（major；K-04、P-76，正确性）

**问题**：步骤在 `{only}` 过滤之前跨全部渲染端编排。`viewFor` 删掉被排除的块，却保留其余块的 `at` 与章节的 `steps`，其他渲染端因此得到不起作用的点击。

**证据**：`compiler/src/steps.ts:63-87`、`renderers.ts:236-239`。探针：`::::{only} web` 加 `:reveal:` 后接一个逐步出现的代码块，幻灯片视图 steps=2，代码块写成 `v-click="2"`；按 Slidev 绝对位置的语义，讲者第一次点击没有任何变化。`{only} slides` 对网页放映同理。

**修法与验收**：`viewFor` 按渲染端压缩步骤：保留仍有块引入的步骤，讲解所在步骤被删时并入前一个保留的步骤，重编 `at`、`until`、`steps`，并在视图的章节上给出旧步骤到新步骤的映射，供 P-74 互跳换算。cli/test/ir.test.ts 用上面的文稿断言幻灯片视图 steps=1、代码块 `at`=1；render-slides/test 断言 slides.md 中为 `v-click="1"`。

### R-04（major；K-01、P-01，正确性与学习者体验）

**问题**：(1) `{include}` 把各文件拼进一棵树，不区分脚注标识。两章都写 `[^1]` 时，加载舞台插件的文稿把 b.md 的定义挪进 a 章（脚注步骤在全文找第一处引用），b 章留下悬空的标记；不加载时 viewer 把 a 章的标记链到 `/b.html#fn-1`。三种形态都受影响，没有诊断。(2) 网页把作者写的标识当编号显示（`[subword]`），并把它单独放在注释上一行；幻灯片显示 `[1]`；notebook 写成 `<br><sup>[subword]</sup>`。

**证据**：`compiler/src/source.ts:134-152`；`addon-stage` 的 `footnotes.ts:36` `firstReference`；`viewer/src/domain/text.ts:60` `footnoteSections`；`viewer/src/style.css:419-425`（`content: '[' attr(data-label) ']'`）。

**修法与验收**：按 C-11。编译器展开每个文件后，对与先前文件重复的 `identifier` 用 `unique()` 改名，`label` 不变，再写 `enumerator`；render-notebook 写 `[n]`。cli/test/ir.test.ts：两个被包含的文件都用 `[^1]`，每章的引用指向本章的定义，两章的 `enumerator` 都从 1 起；render-notebook/test 断言标记为 `[1]`；70b 在 web.spec 断言标记读作 `[1]`。

### R-05（major；K-11，正确性）

**问题**：`presmium dev` 每次防抖触发都在 `running` 链上追加一次完整编译，编译期间到来的每次保存都再排一次，预览越来越落后。每次多余的编译都重跑插件步骤、编译时执行与渲染端更新，编译比保存间隔慢时（代码执行、自动保存）K-11 的 300 ms 目标随之失效。

**证据**：`compiler/src/renderers.ts:164-170`（`running = running.then(recompile)`）。探针（每次编译 1 s，10 次保存间隔 150 ms）：编译在 1.0、2.1、3.1、4.1 s 报告，之后 5.1 至 12.2 s 又有 8 次内容相同的编译。

**修法与验收**：合并排队：用一个 `queued` 标志，已有一次等待中的编译时不再追加，等待的编译开始时读取最新源码。cli/test 的 dev 用例用一个耗时 1 s 的夹具插件步骤连续保存 10 次，断言编译次数不超过 3 且最后一次包含最后的内容。

### R-06（major；P-01、P-42、K-13，抽象层次）

**问题**：三个渲染端各自处理本地文件的 URL，覆盖面不同。web 只发布 `image`，用会抛错的 `decodeURI`（畸形转义使整个网页构建失败，`%23`、`%3F` 不解码）；notebook 复制 image 与 link；slides 只改写 image，写成相对 Slidev 路由的路径。结果是 `[讲义](handout.pdf)` 在网页与幻灯片中 404；幻灯片每翻一页都对被包含页面的图片、媒体与本地化的 PlantUML 图发出 404 请求（Slidev 的预加载器用 slides.md 里的原始相对路径，可见元素却从带哈希的 `/assets` 加载）；addon-content 为了让媒体被发布，把 video 与 audio 伪装成 mdast `image` 并另写一个幻灯片扩展。

**证据**：`web/src/node/publish.ts:52-59`、`render-notebook/src/node/media.ts:21-38`、`render-slides/src/node/slidev.ts:323` 与 `markdown.ts:60`、`addon-content/src/domain/media.ts:76-93`。探针：notebook 有 `media/e04a690b-handout.pdf`，网页产物没有，其 ir.json 仍为 `"url":"handout.pdf"`；幻灯片每页请求 404 的 `/pages/img/spinner.gif`、`/assets/81cc0b28a328938f.svg`。

**修法与验收**：按 C-7。本组实现 `localAsset`、`ComponentNode.assets`，并让 render-slides、render-notebook 使用它们。render-slides/test 与 render-notebook/test 用一份被包含页面中含图片、链接与 `<video>` 的文稿，断言文件被复制、URL 为带 base 的根路径（幻灯片）或 `media/` 路径（notebook）、畸形转义不使构建失败；70b 在 stage.spec 的图片用例断言访问该页没有 4xx 响应，并在 web/test 断言 handout.pdf 被发布。

### R-07（major；P-76，复用）

**问题**：MyST 到标准 Markdown 的降级在 notebook 与幻灯片各写一份。幻灯片版只处理提示框与少数角色，其余压平：figure 的图注贴在图片后面，dropdown 成为“Click meHidden body.”，定义列表成为“**Term**Definition of the term.”，`#label` 链接原样保留，Slidev 路由无法解析。

**证据**：`render-slides/src/node/markdown.ts:55`（`standard()`）；`render-notebook/src/domain/markdown.ts:88-169`（`lower()` 已正确处理 container、details、definitionList、脚注、crossReference、cite 与 `#label` 链接）。

**修法与验收**：按 C-3，把 `lower()` 移到 kernel 的 `lowerMyst(mdast, { links })`（纯函数，不引入依赖），两个渲染端都在写 Markdown 前调用；幻灯片的 `links` 把 `#label` 换成目标章节的页码路由。删除 `standard()`、`alert()`、`ALERTS`、`TAGS`。render-slides/test 断言图注独立成段、dropdown 为 `<details>`、定义列表保留结构、交叉引用链接指向 `/<页码>`；notebook 现有测试通过。

### R-31（minor；K-13、原则 5）

**问题**：`presmium build` 把编译器的原始 IR 写到 `<out>/ir.json`，其中 `meta.entry` 与每个 `source.file` 都是构建机的绝对路径（示例讲义有 119 处），不同检出得到不同的文件；只有 `web/ir.json` 是相对路径。repro.test 只比较 web 与 slides，发现不了。

**证据**：`compiler/src/renderers.ts:94,246`；`cli/test/repro.test.ts:44`（`for (const form of ['web', 'slides'])`）。

**修法与验收**：编译器导出把 IR 改为相对文稿目录的函数，`<out>/ir.json` 写相对版本（web 改用该函数属 C-14 的同一次清理）；`presmium ir` 的标准输出与 dev 的 IR 保持绝对路径，供编辑器跳转，差异由 70d 写入 ir.md。repro.test 也比较 `<out>/ir.json` 与 `notebook/`，并断言其中不含 ROOT。

### R-32（minor；K-16、K-17）

**问题**：插件步骤留下畸形 mdast 时，编译器在第 8 步校验之前就在 `resolveReferences` 中崩溃：用户只看到“Cannot read properties of undefined (reading 'toUpperCase')”，退出码 2，没有文件、行号或插件名。校验器拒绝 IR 的路径没有测试。

**证据**：调用栈 `compiler.ts:194` → `references.ts:26` → myst-transforms `enumerate.js:475`；`grep -rn "presmium.ir\|validateIR" packages/*/test e2e` 无结果。

**修法与验收**：插件步骤之后先运行 `validateIR` 的结构检查，有结构错误的章节跳过 `resolveReferences` 与 `executePass`；或包住这两步，报告指向入口、点名最后一个插件步骤的 `presmium.ir` 错误。cli/test/ir.test.ts 用一个破坏 IR 的夹具插件，断言退出码 1、得到带位置的 `presmium.ir` 诊断。

### R-33（minor；K-07）

**问题**：一个插件的 `rendererExtensions.slides` 组件渲染器抛错，整个幻灯片构建失败，错误报在 `lecture.md:1`；notebook 对同样的错误只降级该块并报在块的行。

**证据**：`render-slides/src/node/slidev.ts:285` 没有 try/catch；`render-notebook/src/domain/notebook.ts:183` 有。

**修法与验收**：包住扩展调用，失败时在 `block.source` 报告点名组件与插件的警告，退回组件标签或 fallback（与 C-4 的外层 `PmBoundary` 一起实现）。render-slides/test 用一个幻灯片扩展抛错的夹具插件，断言构建成功、诊断位于块的行。

### R-34（minor；K-09、K-11）

**问题**：(1) `{include}` 的目标还不存在时不记为依赖，作者随后创建该文件不会触发重新编译；目标目录不存在时 `watchFiles` 直接跳过。(2) 不再依赖的目录的 FSWatcher 直到会话结束才关闭，Parser 缓存保留曾经包含过的每个文件的语法树。

**证据**：`compiler/src/source.ts:144-146`（读成功后才记录）、`:48`（`#cache`）；`renderers.ts:173-191`（`watchers` 只增不减）。探针：创建 `pages/new.md` 后 1.5 s 内仍只有那一次带“file not found”的编译。

**修法与验收**：读取前记录目标；缺失的目录改为监视最近的已存在祖先；每次算出 `watched` 后关闭不在新目录集合中的监视；`expand` 结束后删除不在 `files` 中的缓存项。cli/test 的 dev 用例：先包含一个不存在的文件，创建它后得到含新章节的编译。

### R-35（minor；K-11）

**问题**：dev 只按第一次编译绑定各渲染端的上下文（插件列表、扩展、渲染端配置）。往头部加一个插件后，编译器加载它并开始产生其组件节点，网页开发服务器却不加载该包，页面显示缺少组件，没有任何提示，直到作者想到重启。

**证据**：`compiler/src/renderers.ts:148`；`web/src/node/renderer.ts:58,75` 每次更新都用最初的 `ctx.plugins`。

**修法与验收**：每次编译比较 `doc.config.plugins`、`doc.config.renderers` 与启动时的值，变化时用新的 `renderContext` 重启受影响的渲染端开发服务器，至少报告“plugins changed; restart presmium dev”警告。cli/test 的 dev 用例：加入插件后得到重启或该警告。

### R-36（minor；K-16）

**问题**：`lecture.md` 以 UTF-8 BOM 开头（Windows 记事本、PowerShell 5 的 `Out-File -Encoding utf8`）时头部失效：标题、lang、plugins 全部丢失，YAML 变成首个章节，没有诊断，随后每个插件指令都报“unknown directive”。

**证据**：`splitFrontmatter` 以 `^---` 锚定，`readFile(…, 'utf8')` 保留 U+FEFF。探针：`presmium ir` 退出码 0，`meta.title` 为 lecture，plugins 为空，首节 id 为 `-title-bom-deck-lang-en-us`。

**修法与验收**：在 `Parser.read`、`Compiler.compile` 读头部前与 `frontmatterLine` 的输入处去掉开头的 U+FEFF。cli/test/ir.test.ts：带 BOM 的文稿得到正确的标题、语言与插件。

### R-37（minor；K-01，ir.md 2.2）

**问题**：章节标签等于前面某个无标签章节标题的 slug 时，报“duplicate section label”错误（标签只写了一次），并且无标签的章节拿到 `intro`、带标签的章节变成 `intro-2`，与 ir.md 2.2“标签给出稳定 id”相反。

**证据**：`compiler/src/sections.ts:67-73` 在一个循环中按源码顺序分配 id；`steps.ts` 对块是先保留标签。

**修法与验收**：先保留全部标签（真正重复的才报错），再给无标签章节分配 `unique(slugify(title), used)`。ir.test.ts：`## Intro` 之后有 `(intro)=` `## Introduction proper`，无诊断，带标签的章节 id 为 `intro`。

### R-38（minor；K-16）

**问题**：`{only}` 的渲染端 id 原样使用，拼错（如 `slide`）的内容从所有形态中消失，没有诊断。

**证据**：`compiler/src/blocks.ts:172`；`renderers.ts` 的 `viewFor`。探针：`:::{only} slide` 诊断为空，段落在三种形态中都不存在。

**修法与验收**：id 不是 web、slides、notebook，也不是头部 `renderers` 的键时警告。ir.test.ts 断言得到指向该行的警告。

### R-39（minor；K-11，效率）

**问题**：每次重新编译都对完整提交哈希重新 spawn `git show` 读文件，而这些内容不会变。示例讲义一次热编译有 12 个子进程（6 个 `rev-parse`、6 个 `git show`，其中 4 个读同一提交的同一文件）；10 次热编译的 CPU 剖析中 spawn 自身耗时 449 ms（总约 1050 ms）。dev 每次保存都付这笔开销。

**证据**：`compiler/src/dependencies.ts:44,66`。

**修法与验收**：在 Compiler 级别（跨编译）缓存 ref 为完整提交哈希时的读取（键为 `path\0ref`，只缓存读到内容的结果），修订记录照旧。现有 build.test、check.test 通过；合并说明记录前后对比（评审者的临时补丁测得每次编译 12 个子进程降为 6 个，热编译 104.7 ms 降为 63.1 ms）。

### R-40（minor；效率）

**问题**：`build` 依次等待各渲染端，而它们写各自的目录，网页与幻灯片各在自己的子进程中构建。示例讲义 `--to web,slides,notebook` 用 57 s，幻灯片的 7.9 s 叠加在网页之上。

**证据**：`compiler/src/renderers.ts:98`。

**修法与验收**：先创建全部上下文，用 `Promise.all` 运行选中的渲染端，全部结束后按 `selected` 的顺序写入产物（诊断已经通过 `ctx.report` 推送）。现有 cli 测试与全量 e2e 通过，没有超时或内存回归；合并说明记录示例讲义的构建时间。

### R-41（minor；复用）

**问题**：遍历 IR 块及其组件子块的代码写了约 10 遍：`compiler/src/execute.ts:211` 与 `references.ts:51` 的 `allBlocks` 完全相同，另有 `language-server/src/domain/sections.ts:3`、`addon-code` 的 `resolve.ts:52`、`addon-content` 的 `plantuml.ts:8`（漏掉组件 fallback）、`compiler/src/renderers.ts:278` 与 `validate.ts:65`、`viewer/src/domain/text.ts:62`、`web` 的 `renderer.ts:22` 与 `publish.ts:66`、`addon-publish` 的 `assets.ts:11`。`sourceOf` 在 `blocks.ts:340` 与 `sections.ts:85` 相同。kernel 的 `errorMessage` 没有导出，于是另有 4 份定义与 26 处内联；`isRecord` 定义 7 次；`failedRun` 在 exec 与 exec-local 各一份。

**证据**：同上；`kernel/src/errors.ts` 不在 `kernel/src/index.ts` 的导出中。

**修法与验收**：按 C-3 导出共用函数；`sourceOf` 从 `compiler/src/source.ts` 导出；本组替换 kernel、compiler、cli（删除 `cli/src/errors.ts`）、render-*、language-server 中的副本，其他组替换各自包中的。合并后 `grep -rn "instanceof Error ?" packages/*/src` 只剩 kernel 一处，全部测试通过。

### R-42（minor；复用、抽象层次）

**问题**：编译器已经解析出每个插件的目录（`LoadedPlugin.dir`），`RenderContext` 却只传名字，`web/src/node/addons.ts:25` 与 `render-slides/src/node/slidev.ts:137` 各自再遍历 node_modules，而且调用 realpath、起点不同，可能加载与编译器不同的副本。幻灯片的 `extensionFor` 按组件名匹配任意插件，notebook 要求 `node.plugin` 一致，同一文稿在两种渲染端可能选中不同插件的扩展。`portable`、`inRepository` 在 `slidev.ts:68-79` 与 `web/src/node/publish.ts:153-170` 各一份。

**证据**：`compiler/src/plugins.ts:81-91`；`slidev.ts:98`；`render-notebook/src/domain/notebook.ts:208`。

**修法与验收**：按 C-14 在上下文中提供 `pluginDirs`、`extensionFor`、`portable`，render-slides、render-notebook 改用，删除副本；web 由 70b 改用。render-slides/test 用两个插件声明同名组件的文稿，断言幻灯片与 notebook 选用同一插件的扩展。

### R-43（minor；测试政策）

**问题**：约 13 个包的测试各自用 execFile 包装 presmium CLI。只有 repro、drawings 与 addon-publish 去掉了 Vitest 的 `NODE_ENV=test`（repro.test 说明它会让 Vue 构建写入源文件名），其余测试中网页、幻灯片与 exec-local 的构建运行在和作者、e2e 不同的模式下。

**证据**：`addon-classroom/test/notebook.test.ts:78`、`addon-code/test/check.test.ts:133,209`、`addon-exec/test/compile.test.ts:81,131`、`web/test/offline.test.ts:18`、`render-slides/test/slides.test.ts:25`、`render-notebook/test/notebook.test.ts:32`；`cli/test/helpers.ts`。

**修法与验收**：按 C-20 导出 `@presmium/cli/testing`，本组迁移 cli、render-slides、render-notebook、language-server 的测试，其他组迁移各自的。合并后 `grep -rln "execFile" packages/*/test` 只剩 cli 的助手，全部测试通过。

### R-44（minor；P-80、N-07）

**问题**：语言服务自带一份内置指令表，与编译器的不一致，缺少 `{config}`，补全中不出现；`code-ref` 被写死为锚点指令。悬停标签、补全说明与 VS Code 扩展的界面只有英文，zh-CN 文稿的悬停显示“Recorded output”“No recorded output yet”。

**证据**：`language-server/src/domain/directives.ts:41-48`；`compiler/src/blocks.ts:65-66` 的 `BUILTIN_DIRECTIVES` 含 config；`syntax.ts:21`；`anchors.ts:76-78`；`vscode/package.json` 只有英文标题，没有 `package.nls.zh-cn.json`。

**修法与验收**：`@presmium/compiler` 导出内置指令规格（名称、选项、说明），语言服务据此构建列表；按 C-22 用 `DirectiveSpec.arg` 识别锚点参数；language-server 增加按文稿 lang 选择的 zh-CN、en 文本，扩展增加 `package.nls.json` 与 `package.nls.zh-cn.json`。lsp.test.ts：指令补全含 `config`；zh-CN 文稿的悬停为中文。

### R-45（minor；复用）

**问题**：语言服务的 `runChecks` 重复 `presmium check` 的检查循环（CheckRegistry 注册、按插件查头部行、无位置的诊断放到插件所在行），`declaresPlugins` 复制编译器 `splitFrontmatter` 的正则。`presmium check` 定位诊断方式的改动到不了编辑器。

**证据**：`language-server/src/node/decks.ts:81-99,103`；`cli/src/check.ts:47-61`。

**修法与验收**：`@presmium/cli` 导出从 `runCheck` 中提出的 `pluginChecks(compilation)`，两处共用；`@presmium/compiler` 导出 `readFrontmatter`，`declaresPlugins` 改为 `'plugins' in readFrontmatter(text)`。lsp.test.ts 与 cli 的 check 测试通过。

### R-46（minor；P-80，效率）

**问题**：`Decks.of` 逐个等待每份已知文稿正在进行的编译之后才判断文件归属，即使当前编译已经列出该文件。保存之后，悬停、跳转、补全与预览跟随都要等一整次编译（含插件检查），文稿 A 的保存也阻塞文稿 B 的请求。

**证据**：`language-server/src/node/decks.ts:152,158`；`server.ts:70-74`。

**修法与验收**：先返回当前编译已拥有该文件的文稿而不等待；只有尚无编译或没有文稿拥有该文件时才等待 `ready()`。lsp.test.ts：保存触发一次慢编译（夹具插件步骤 1 s）期间，对已知文件的悬停请求在 200 ms 内返回。

### R-47（minor；P-70、P-76、K-02）

**问题**：文稿 `components/` 中的组件在网页中能渲染，但 (1) 每次 check、build、dev 都警告“no plugin in plugins registers the component”，语言服务重复该警告；(2) 幻灯片把它换成“组件 … 只能在网页中查看”，丢掉内部步骤，构建报告不列出；(3) 补全不提供它；(4) 文稿自己不依赖 `@presmium/host` 时网页构建报 Rollup 无法解析。这些都没有文档。

**证据**：探针文稿的 `components/StepBadge.vue`：`lecture.md:107 warning {component}: no plugin in plugins registers the component StepBadge`；`web/src/node/addons.ts:38-40` 已按约定登记 `components/`。

**修法与验收**：编译器以插件 id `deck` 登记 `<deck>/components/*.vue`（规则与 web 相同），警告消失、补全可见；render-slides 把 `<deck>/components` 链接或复制到生成的 Slidev 项目的 `components/`（Slidev 文档化的目录）。70d 在 architecture 5.1 写明本地组件只能导入 `@presmium/host` 且文稿需依赖它。cli 构建测试：带本地组件的文稿 0 警告，幻灯片中渲染该组件并保留其步骤。

### R-48（minor；P-75，ir.md 6）

**问题**：ir.md 6 与构建报告都说没有降级内容的组件得到“指向网页版的一行说明”，但未设 `renderers.notebook.webUrl` 时说明是纯文本，该选项只出现在源码中。

**证据**：`render-notebook/src/domain/notebook.ts:245-248`；`render-notebook/src/node/presmium.ts:8`。

**修法与验收**：同一次构建也构建网页且未设 webUrl 时，使用相对链接 `../web/<页>#<节>`（与 dist 结构一致）；否则在报告中提示设置 `renderers.notebook.webUrl`。70d 在 ir.md 记载该选项。render-notebook/test 断言同时构建网页时说明带相对链接。

### R-49（minor；P-75）

**问题**：notebook 中表格单元的行内内容被插入的 `<br>` 断开，`` `low` + `est` `` 变成三行，脚注标记单独占一行。

**证据**：示例讲义 notebook 第 2 个单元的源为 ``| `lowest` | `low`<br> + <br>`est` | 260, 257 |``。

**修法与验收**：表格单元的行内子节点直接拼接，只在真正的换行或块级子节点处写 `<br>`。render-notebook/test 断言该单元为 `` `low` + `est` ``。

### R-50（minor；P-75）

**问题**：notebook 把正文中的 `$` 原样写出，Jupyter 把两个 `$` 之间的文字当作行内公式，价格或 `$PATH and $HOME` 只在 notebook 中被弄乱；幻灯片渲染端已经转义。

**证据**：`render-notebook/src/domain/markdown.ts:94`；探针：“A coffee costs $5 and a cake $3.”原样写出，幻灯片写作 `\$5 … \$3`。

**修法与验收**：`lower()` 中把含 `$` 的 text 节点改写为 html 节点，`$` 写作 `\$`。notebook.test 加含两个价格的段落，断言输出 `\$5` 与 `\$3`。

## WP-70b（网页形态与 IR 运行时）

拥有：`packages/host`、`packages/addon-core`、`packages/web`、`packages/viewer`、`packages/addon-stage`、`packages/addon-guide`、`e2e/viewer.spec.ts`、`e2e/web.spec.ts`、`e2e/core.spec.ts`、`e2e/smoke.spec.ts`、`e2e/stage.spec.ts`、`e2e/guide.spec.ts`、`e2e/perf.spec.ts`、`e2e/urls.ts`、`e2e/fixtures/deck.ts`、`e2e/fixtures/viewer`、`e2e/fixtures/web`、`e2e/fixtures/core`、`e2e/fixtures/host`、`e2e/fixtures/stage`、`e2e/fixtures/guide`

本组在约定中的部分：C-2（viewer、addon-stage、addon-guide 的迁移）、C-3 与 R-41（替换本组包中的副本）、C-4（`resetKey` 与本组 7 个组件）、C-7（web 使用 `localAsset`）、C-8（web 加入 `vitePlugins`）、C-9、C-10（`originParts`）、C-11（显示 `enumerator`）、C-12、C-13（网页默认 base）、C-14（web 改用）、C-15（guide 与 viewer）、C-18、C-19、C-20（迁移 web 的测试）、C-21、C-23（viewer）。

### R-08（major；K-06，复用与抽象层次）

**问题**：跨窗口共享状态有三套实现。`web/src/client/shared.ts` 是 host `createSharedStates` 的逐行副本（97 行）；viewer 另有 `Viewer.shared/share` 与 hello、shared 消息，走只按标题命名的 `presmium.viewer:<标题>` 通道；舞台插件在幻灯片形态用 Slidev `createSyncState` 加手写的开发期 BroadcastChannel，在网页形态用 `viewer.share`。后果：同源下同名的两份文稿互相跟随放映位置与黑屏；网页形态的黑屏、冻结不经同步传输到达学员，幻灯片形态会。architecture 9.5 把前两项派给 WP-61，WP-61 合并时没有处理。

**证据**：`viewer/src/viewer.ts:69,86-151`；`addon-stage/setup/screen.ts:16,27,35`；`addon-stage/src/client/viewer.ts:28,58`；`diff host/src/shared.ts web/src/client/shared.ts` 只有导入行不同。探针：base 为 /a/ 与 /b/ 的两份同名文稿，在 /a/ 翻两步后两边都到第三节，按 b 后两边都黑屏；课堂中主讲在网页放映按 b，学员没有黑屏层。

**修法与验收**：按 C-9。theme.ts 从 `@presmium/host` 导入 `createSharedStates`，删除 `web/src/client/shared.ts`；viewer 改用 `deckChannel` 与 `joinWindows`；舞台两种形态都用 host 的 `useSharedState`，删除 `setup/screen.ts` 的 `browserWindows`。viewer.spec 记录 BroadcastChannel 名称（同 `core.spec.ts:25` 的做法），断言名称含 base；另构建两份同名、不同 base 的文稿，在一份中翻页另一份不动；web.spec 用核心夹具的设备传输断言网页形态的黑屏到达另一设备；stage.spec 现有用例通过。真实课堂传输的断言由 70c 在 R-91 中加。

### R-09（major；P-31、P-32，学习者）

**问题**：在网页形态（主媒介与日常放映）中，`{spotlight}` 只有描边，不压暗页面，标题与说明（ir.md 5.1 的“弹出说明”）在文档、滚动叙事、放映与演讲者窗口中都不出现；`{hint}` 只有一圈淡环，说明打不开。只有幻灯片画出 driver.js 的遮罩、弹出说明与提示点。示例讲义中“分词结果：每个色块是一个词元……”与“词表：……全部 266 个词元”网页读者看不到，讲解却请读者“打开词表查看”。

**证据**：`addon-guide/src/client/live.ts:12-17`（`LIVE_PROBE` 只由幻灯片的 `setup/main.ts:9` 提供）；`cue.ts:51` 只有 look 为 live 时才画标题与文字；`PmSpotlight.vue`、`PmHint.vue` 渲染空的隐藏 span；`e2e/guide.spec.ts:226-252` 只断言 `data-pm-spotlight='inline'`。探针：网页四种视图的 innerHTML 都不含“点击搜索后，结果出现在这里”。

**修法与验收**：放映视图的观众幻灯片上 `LIVE_PROBE` 为真（viewer 通过 host 的注入或 ViewerPluginContext 暴露当前视图），driver.js 在那里画遮罩、弹出说明与提示点；文档与滚动叙事视图在目标旁显示标题与说明，文档视图作为最终状态常显。guide.spec 网页形态：放映第 4 步出现文字为“搜索结果”的 `.pm-spotlight-popover .driver-popover-title` 且页面被压暗，第 5 步的提示点能打开“帮助”；文档视图包含两段说明。

### R-10（major；P-74，6.8 验收）

**问题**：按 ir.md 2.1 的写法（不设 base）同时构建网页与幻灯片时，两种形态的互跳链接在任何部署方式下都不能同时可用。两者都以 `/` 为 base，网页链到 `/slides/N`，幻灯片链到 `/web/?slide=N`：把 `dist/` 放在根目录时两边的资源都 404；各自放在根目录时链接指向不存在的路径。e2e 能通过只因为夹具设了 base；示例讲义用的是默认配置。

**证据**：`web/src/domain/config.ts:68`（默认 `/`）；`e2e/fixtures/web/deck/lecture.md:9-10`；探针：以 `dist/` 为根服务时 `/web/` 的 `/assets/app.*.js` 404、页面未 hydrate，`/slides/` 渲染 0 张。ir.md 未记载 base、port、slidesUrl、webUrl、`renderers.notebook.webUrl`。

**修法与验收**：按 C-13（默认部署结构的改变见待决定 1）。web.spec 加一份不写任何渲染端选项的文稿，把 `dist/` 当根目录服务，网页→幻灯片→网页往返都到达对应的节与步骤。

### R-11（major；N-05，GAP-13 回归）

**问题**：网页放映视图在常见的 16:9 与 16:10 投影分辨率下仍截断宽代码。`useFit` 只按高度缩放，宽行在 `overflow: auto` 的 `<pre>` 里横向滚动，帧级检查看不到；幻灯片最大宽度 72rem，1920 宽的投影两侧留白而代码被截。

**证据**：`viewer/src/present.ts:132-143` 只比较 `inner.offsetHeight` 与 `outer.clientHeight`；`viewer.spec.ts:207-211` 只查 `frame.scrollWidth`，且用的是夹具。探针（示例讲义 `?view=present`）：1920x1080 下 tokens-bytes 1070>922、implement-train 1007>922、encode-order 1032>922、encode-decode 1149>922；1440x900 同样 4 节；1366x768 3 节；1280x720、1280x800 下 encode-decode 1053>998；只有 1024x768 合适。

**修法与验收**：`scale = min(可用高 / 自然高, 可用宽 / 内容中 pre 与 table 的最大 scrollWidth)`，最大宽度改为 `min(92vw, …)`。扩展 viewer.spec 的适配用例，用一份含宽代码与宽表格的夹具，在 1920x1080、1440x900、1366x768、1280x720、1280x800 下遍历每节，断言 `.pm-present__slide` 内每个 pre 与 table 的 `scrollWidth <= clientWidth`。

### R-12（major；P-77，讲者）

**问题**：网页形态应用 `?view`、`section`、`step` 后立即把它们从地址中去掉，之后也不写回位置。刷新（F5、休眠后恢复的标签页、投影浏览器崩溃）会把讲者从放映视图扔回起始页的文档视图第一节；演讲者窗口的地址同样被剥掉，刷新后变成普通阅读页；后退直接离开站点。幻灯片形态的地址保留 `/N?clicks=k`。

**证据**：`web/src/client/theme.ts:130`（`history.replaceState(history.state, '', location.pathname + location.hash)`）。探针：从 `/` 打开放映，前进 9 步到 idea-by-hand:2，刷新后为 `{url:'/', present:null, view:'document', reading:'cover'}`；演讲者窗口的地址为站点根。

**修法与验收**：覆盖视图（present、presenter）激活时，每次 `viewer.position` 变化用 `history.replaceState` 写入 `?view=&section=&step=`，回到页面视图时去掉；`theme.ts:127-134` 已能解析这些参数。viewer.spec：打开放映，前进到另一页的一节，刷新后放映视图中 `data-section`、`data-step` 不变；演讲者窗口同样。

### R-13（major；K-07，抽象层次）

**问题**：18 个插件组件在自己的模板里包 `PmBoundary`。Vue 的 errorCaptured 只接住后代的错误，组件自己的 `setup()` 或模板表达式抛错会越过它。网页由 viewer 在外层再包一次（`block.ts:41`），所以没事；幻灯片形态 render-slides 只写裸标签，这样的组件在幻灯片中直接消失：没有占位、没有记录、演讲者视图也没有提示。夹具 `PmDemoBroken` 只从子组件抛错，恰好是内层边界能接住的情况。

**证据**：`grep -l PmBoundary packages/*/components/*.vue` 共 18 个；`render-slides/src/node/slidev.ts:282-299` 写裸标签。探针：没有外层边界时，自身模板与自身 setup 抛错两种情况都渲染为 `<!---->`，错误到达 `app.config.errorHandler`。

**修法与验收**：按 C-4（render-slides 的包裹由 70a 实现）。本组删除 addon-core 夹具组件与 addon-guide 组件中的自包装；70d 把 architecture 5.4 改为“渲染端隔离组件”。core.spec 在两种形态各加一个在自身 setup 中抛错的夹具组件，断言出现 `[data-pm-error]` 占位、演讲者视图的错误计数为 1；现有 `PmDemoBroken` 用例通过。

### R-14（major；K-11、K-04）

**问题**：`PmBoundary` 的 `failed` 一旦设置就不再清除，viewer 在实时更新与切换步骤时复用同一个边界实例（无 key）。作者修好组件后占位仍在，只有刷新页面才恢复；全局 `caughtErrors` 与演讲者的错误计数也一直保留。只在某一步出错的组件回到其他步骤时同样停在占位。

**证据**：`host/src/boundary.ts:35-41`；`viewer/src/block.ts:324`。探针：dev 中把 `:fail: true` 改为 false，3 s 后仍显示“Boom 出错：boom”，刷新后才显示“all good”。

**修法与验收**：按 C-4，`PmBoundary` 的 `resetKey` 变化时清除 `failed` 并从 `caughtErrors` 删去自己的记录；viewer 的 ComponentView 传入组件属性与子节点的哈希（非展开视图再加上块的步骤）。viewer.spec 的 dev 用例：组件出错后改源码修好，不刷新即显示正常内容，演讲者的错误计数归零。

### R-15（major；P-70、P-40）

**问题**：一个元素只要有原始 HTML 子节点，`hastToVNodes` 就把整个元素序列化成 `innerHTML`，viewer 自己的 `pm-math`、`pm-mermaid`、`pm-code` 变成空的自定义标签。`Energy <b>is</b> $E = mc^2$ here.` 显示为“Energy is here.”，没有警告。讲义常把 `<kbd>`、`<br>`（表格单元）、`<sup>` 与公式混用，主媒介因此静默丢内容。

**证据**：`viewer/src/markdown.ts:214-216`。探针：渲染结果为 `<p>Energy <b>is</b> <pm-math pmtex="E = mc^2"></pm-math> here.</p>`，`.katex` 数为 0。

**修法与验收**：在 `markdownToHast` 中用 `hast-util-raw`（rehype-raw 的核心）把原始 HTML 解析进 hast，三种 viewer 元素作为自定义节点类型 passThrough；`hastToVNodes` 把它们渲染为组件，删除 `innerHTML` 分支与 `raw()` 助手。viewer.spec 的 MyST 夹具加上面的段落和一个含 `<br>` 与 `$x$` 的表格单元，断言 `.katex` 存在、文字完整。

### R-16（major；K-11）

**问题**：未加标签的章节 id 是标题的 slug。实时更新改了当前章节的标题后，`update()` 用 `clampPosition` 把不存在的 id 映射到第一节，放映与演讲者窗口一起跳回封面。排练时修正当前幻灯片标题的一个错字就会这样。

**证据**：`viewer/src/viewer.ts:137`、`viewer/src/domain/steps.ts:42-43`。探针：`?view=present&section=third&step=1` 下把“## Third”改为“## Third, retitled”，位置从 third/1 变为 first/0。

**修法与验收**：`update()` 中当前章节不在新文稿里时，取旧顺序中同一序号的章节（按新长度截断），步骤按其 `steps` 截断；只有文稿为空时才回到第一节。viewer.spec 的 dev 用例：放映中修改当前节的标题，位置留在该节同一步。

### R-17（major；效率，构建时间）

**问题**：VitePress 的 SSR 构建把只在浏览器运行的模块（mermaid、Shiki 语法、KaTeX、elk、cytoscape、全部插件组件与客户端插件）也打包一遍，每次网页构建对约 17 MB 的模块跑两遍 Rollup。这些模块在服务端都不运行：rich.ts 与 highlight.ts 只在挂载后加载，客户端组件在服务端渲染占位，plugins 与 viewers 只在 `if (!inBrowser) return` 之后使用。

**证据**：`web/src/node/site.ts:133`；`viewer/src/rich.ts:17,49`、`highlight.ts:10-31,55`；`web/src/client/theme.ts:61-74,192`。探针：客户端 17.0 MB / 2888 个模块，SSR 16.7 MB / 2876 个；`vitepress build` 的 50 s 中 32.6 s 是 Rollup tree-shaking、12 s 是 GC。

**修法与验收**：用 Vite 文档化、静态替换的 `import.meta.env.SSR`：rich.ts、highlight.ts 的动态导入在 SSR 中返回永不完成的 Promise 与空语法表；site.ts 生成的组件加载器在 SSR 中返回永不完成的 Promise（保留名字，服务端仍渲染占位；直接换成 `{}` 会破坏 hydration），plugins、viewers 在 SSR 中为空数组。现有 web.spec、viewer.spec、repro.test 通过；合并说明记录示例讲义的构建时间与 SSR 变换大小（评审者在示例讲义副本上测得 50.9 s 降为 24.2 s，SSR 变换 16.7 MB 降为 1.7 MB，7 个页面屏蔽资源哈希后逐字节相同，客户端资源不变）。

### R-51（minor；P-31，抽象层次）

**问题**：一个板块是否只含覆盖层，由渲染后的 `:has(.pm-overlay)` CSS 判断。网页中插件组件是客户端组件，服务端渲染与首帧只有 `span.pm-client-only`，规则不匹配，先画出空卡片再收起：没有 JS 的读者看到空卡片，每个引导块加载时约 66 px 的布局跳动。`pm-overlay` 类名还被覆盖视图容器使用（`theme.ts:143`），含义不同。

**证据**：`viewer/src/style.css:122-125`；探针：encode.html 中 pm-cursor-1、pm-spotlight-1、pm-hint-1 的板块无 JS 时各 26 px，加载后为 0。

**修法与验收**：按 C-15，guide 的指令设置 `layer: 'overlay'`，viewer 的 `documentBlocks()` 把覆盖层块放到板块之外，删除 `:has()` 规则，覆盖视图容器改名。R-09 之后聚光灯在文档视图有说明，纯覆盖层只剩光标。guide.spec：禁用 JS 加载夹具页时没有空的 `.pm-board`；启用 JS 后引导块所在区域加载前后高度不变。

### R-52（minor；K-20、P-72、P-62）

**问题**：文档视图对“当前在哪一节”的判断有三处偏差。(1) 打开 `page.html#<节>` 时，上方的客户端组件（执行面板、Mermaid、PlantUML、markmap）在锚点跳转之后才挂载，把目标推下去，落到错误的节。(2) 切换到放映视图时取 60% 阅读线所在的节，常常是更后面的一节。(3) 课堂中主讲用侧栏或锚点跳到页底附近的节时，页面滚到底，发布的位置是最后一节，学员落到别的节，随后切到放映也从那里开始。

**证据**：`viewer/src/section.ts:15`（`STEP_LINE = 0.6`）、`:57`、`:97`。探针：content.html#p42 时 p42 在 720 px，放映打开 p43；code.html#p14 正确，放映却打开 p16；主讲跳到 #classroom-exercise，学员停在 classroom-questions。

**修法与验收**：客户端组件占位预留高度，或在它们挂载后重新应用锚点滚动；显式导航（锚点或 `go()`）的目标在用户滚动之前一直作为当前节；切换视图时优先取标题位于视口顶部的节。viewer.spec：在执行面板与图表下方打开 `#<节>`，该节在视口顶部，切到放映后仍是该节；70c 可在 session.spec 加学员落点的断言。

### R-53（minor；P-77，讲者）

**问题**：放映与演讲者的计数把从 0 起的步骤序号与最后一个序号并列：没有步骤的节显示“第 0 步，共 0 步”，4 个状态的节结束于“第 3 步，共 3 步”。演讲者面板的展开项以产品名“Presmium”为标签，在网页中压住当前画面预览，在幻灯片中压住点击时间轴；网页演讲者的当前画面缺少观众看到的节标题。

**证据**：`viewer/src/domain/messages.ts:10,19`；`present.ts:269,322`（传 `step.value, current.steps`，IR 的 steps 是最后一步的序号）；`host/src/PresenterPanels.vue:34-37`。

**修法与验收**：显示 `step + 1` / `steps + 1`，steps 为 0 时省略步骤部分；面板标签改为本地化的功能名（“课堂与工具”、“Panels”），放进演讲者窗口的侧栏，不压在预览上；当前画面渲染节标题。更新 viewer.spec 的计数断言；断言演讲者窗口中面板与预览的 boundingBox 不相交。

### R-54（minor；P-43）

**问题**：MyST 的 `{iframe}` 编成 mdast `iframe` 节点，网页与幻灯片都不渲染，只剩图注，两者构建都不警告（只有 notebook 报告降级）。原始 `<iframe>` HTML 与自定义元素正常。

**证据**：网页 DOM 为 `<figure class="pm-figure"><figcaption><p>iframe 指令</p></figcaption></figure>`；`viewer/src/markdown.ts` 与 `render-slides/src` 中没有 iframe 处理，只有 `viewer/src/style.css:74` 的选择器。

**修法与验收**：viewer 的 markdown.ts 增加 iframe 处理，在 figure 内渲染 `<iframe src width loading="lazy">`；幻灯片部分按 C-23 由 70a 实现。`e2e/fixtures/viewer/myst` 加一个 `{iframe}`，viewer.spec 断言其 src；70a 在 render-slides/test 断言 slides.md 中有该 iframe。

### R-55（minor；P-16）

**问题**：网页放映中 `:variants:` 的版本切换是即时替换（`viewer/src/code.ts:182` 用新值重渲染同一个 CodeView），不是需求要求的原地动画；幻灯片用 Shiki Magic Move。

**修法与验收**：步骤视图中用 `shiki-magic-move`（MIT，Slidev 使用的库）渲染版本切换，减少动态效果时即时替换。viewer.spec 用一份带 `:variants:` 的夹具：切换时出现 magic-move 容器；`reducedMotion: 'reduce'` 下 `document.getAnimations()` 为空。

### R-56（minor；P-13，复用）

**问题**：viewer（`code.ts:81-101,188-225`，用 h()）与 render-slides（`slidev.ts:235-271`，HTML 字符串）各建一份 `.pm-code-origin` 来源栏和各自的文本表，已经走样：英文状态词不同（Moved/Unconfirmed/Lost 与 moved/to confirm/lost），幻灯片的漂移徽章没有说明，也丢掉输出说明（超时、退出码、录制）。多版本 `{code-ref}` 的文件链接与行范围总是最新版本，即使正在显示旧版本。两处还保留过时的 `type Origin = CodeOrigin`、`type Variant = CodeVariant` 别名与强制转换，注释称这些字段是 IR 之外的，而 IR 已经定义了它们。

**证据**：`viewer/src/domain/messages.ts:34-49,99-115`；`slidev.ts:29-46,218-220`；`viewer/src/code.ts:63-68,83,87`。探针：幻灯片 /p16 第 0 步显示 6e4072a 的 7 行版本，来源栏却是 `cart.ts:10-12` 并链到 f6960cc 的 `#L10-L12`。

**修法与验收**：按 C-10 实现 `originParts`、`outputNotes`；显示某个版本时用该版本的 permalink 与行号；删除别名与转换。viewer.spec 断言网页来源栏的漂移徽章有说明、输出说明齐全；70d 在 code.spec 断言每一步的文件链接与行范围（R-109）。

### R-57（minor；N-05，学习者）

**问题**：“反复合并最常见的一对”的流程图按栏宽缩放，16 px 的标签在桌面约 7.6 px，在 375 px 手机上约 3 px，无法阅读。Mermaid 只按首次加载时的主题初始化一次，切换到暗色后图仍是亮色，连线在暗背景上几乎看不见。

**证据**：探针：viewBox 1222x190 在 1280x800 下渲染为 579x90（缩放 0.47）；`viewer/src/rich.ts:49-52`。

**修法与验收**：经公开的 `mermaid.initialize` 传 `flowchart: { useMaxWidth: false }`，外层 `overflow-x: auto`，图不缩到可读尺寸以下；监听 `documentElement` 的 dark 类变化，用对应主题重绘（示例讲义的图改为 TB 由 70d 决定）。web.spec：375 与 1280 宽下 Mermaid 文字的渲染高度至少 12 px；切换暗色后图用暗色主题。

### R-58（minor；N-06，GAP-24 后续）

**问题**：正文已随浏览器默认字号缩放，但章标题（32 px）、节标题（24 px）、侧栏、页内大纲、搜索按钮与翻页仍是 VitePress 主题的固定 px。默认字号 32 时节标题比正文还小，层级颠倒。

**证据**：探针（Page.setFontSizes）：默认 32 时 body 32 px、节标题 24 px、章标题 32 px、侧栏与大纲 14 px、搜索 13 px；`e2e/web.spec.ts:339-346` 只查 html 与 body。

**修法与验收**：web 的 style.css 与 viewer CSS 中节、章标题改用 rem；侧栏、大纲与翻页只通过 VitePress 文档化的 CSS 变量改为 rem，没有变量的记入 R-72 的清单。扩展 web.spec 的字号用例：h1、h2 随默认字号变大，且始终大于正文。

### R-59（minor；N-06）

**问题**：网页中几个控件在键盘焦点下没有可见指示：每页的视图菜单 select、测验的单选按钮、练习的代码框、执行面板的参数输入。

**证据**：探针 p32.mjs 与未聚焦的克隆比较样式完全相同；视图菜单聚焦时 outline 为 `none 3px`，边框不变。

**修法与验收**：在 `web/src/client/style.css` 与幻灯片形态的全局样式 `addon-core/style.css` 中，为 Presmium 控件加 `:focus-visible` 规则（如 `outline: 2px solid var(--vp-c-brand-1); outline-offset: 2px`），不需各组件改动。web.spec 与 core.spec 用 Tab 依次到达这些控件，断言 outline 或 box-shadow 不为 none。

### R-60（minor；学习者）

**问题**：CJK 回退字体没有粗体字面时（如 Droid Sans Fallback），网页中加粗的中文术语（分词、词元、词表、预分词）显示为常规字重，因为 VitePress 基础样式设置了 `font-synthesis: style`，禁止合成粗体；幻灯片正常加粗。

**证据**：探针：`strong` 的 weight 为 700、font-synthesis 为 style；`fc-list :lang=zh` 只有常规字面。

**修法与验收**：web 的 style.css 加 `.vp-doc :is(strong, b, th), .pm-present :is(strong, b) { font-synthesis: weight style; }`。web.spec 断言 strong 的计算样式 font-synthesis 含 weight。

### R-61（minor；P-70，GAP-07 同类）

**问题**：生产构建的 idea、implement、encode、wrapup 页报“Hydration completed but contains mismatches.”；加载发布插件的文稿从第三次带缓存的加载起也报（疑为发布插件的工具栏项在缓存启动时于 hydration 前注册，而服务端渲染的 PmToolbar 没有项，未验证）。静态 HTML 中每个插件组件只有空的 `<span></span>`，数学是原始 TeX，没有 JS 的读者与搜索引擎看不到这些内容，hydration 时页面跳动。

**证据**：探针 walk.mjs 的控制台错误；hcheck2.mjs 二分：core+publish 第 3、4 次加载不一致，core 单独、core+stage、core+content 不会；p23.mjs：tokens-bytes 的按钮 SSR 为 `disabled=""` 而客户端启用。`web/src/client/theme.ts:139`；`addon-publish/src/client/plugin.ts:25`。

**修法与验收**：PmToolbar 的项在挂载后才渲染；客户端组件放进 VitePress 公开的 `<ClientOnly>`（或挂载后 v-if），让服务端与客户端首帧一致；数学在构建时用 KaTeX `renderToString` 渲染。web.spec 遍历夹具的全部页面（含加载发布插件的文稿，每页带缓存加载三次），断言没有控制台错误；某页的静态 HTML 中含 `.katex`。

### R-62（minor；K-11）

**问题**：保存后约 50 ms 内（重新编译期间）打开的页面拿到旧 IR，此后不再收到更新，没有任何提示，直到下一次保存。作者保存后立即刷新，或编辑器预览在保存后立即打开时都会遇到。

**证据**：`web/src/node/vite.ts:109-114` 只发一次 `UPDATE_EVENT`；`web/src/client/theme.ts:198` 只监听，不在（重新）连接时同步；`renderer.ts:73` 的差异假设客户端持有上一版本。探针：延迟 0、50 ms 时等待新节 15 s 超时，150 ms 起正常。

**修法与验收**：每个发布的 IR 带修订号（内容哈希）；客户端在 `vite:ws:connect` 时，以及收到的更新基准修订号与自己的不同时，重新获取当前 IR（带查询参数重新导入 `virtual:presmium/ir`）。viewer.spec 的 dev 用例：保存后立即打开页面，期望看到新文字。

### R-63（minor；K-11，效率）

**问题**：网页开发服务器每次更新都读取并 SHA-256 每张本地图片，`copyDir` 对 `public/` 的每个文件读取源与目标逐字节比较，即使只改了文字。40 MB 视频加 40 个 1 MB 文件时每次保存阻塞 91.6 ms 同步 I/O，其中 17.0 ms 是图片哈希，随媒体大小线性增长。

**证据**：`web/src/node/renderer.ts:139-148`、`publish.ts:186-188`、`site.ts:35-46,184`。

**修法与验收**：`copyDir` 在目标的大小与 mtime 与源相同时跳过，复制后用 `utimesSync` 设置副本时间；内容哈希按（路径、大小、mtime）缓存。行为不变，现有测试通过；合并说明记录探针 probe-public.mjs 的前后耗时。

### R-64（minor；K-13、N-03）

**问题**：网页构建复用 `.presmium/web/build`，复制图片时只检查目标是否存在，从不删除旧副本：改过的图片的每个历史版本都被发布并被 Service Worker 预缓存，读者离线时下载过期图片；长期使用的检出与新克隆的产物不同（多出文件，SW 缓存版本不同）。从文稿 `public/` 删除的文件同样残留。

**证据**：`web/src/node/publish.ts:59`、`renderer.ts:40`、`site.ts` 的 `copyDir`。探针：构建、修改 chart.svg、再构建后 `dist/web/media` 有 `674018f2-chart.svg` 与 `8db3974a-chart.svg`，presmium-sw.js 两个都预缓存。

**修法与验收**：`renderer.build` 开始时删除 `files.publicDir`（至少 `media/`）再发布；dev 启动时同样清理一次。web/test：构建、修改图片、再构建，`dist/web/media` 与预缓存清单中只有一个版本。

### R-65（minor；N-03、P-70）

**问题**：(1) `viewer/src/markdown.ts:129` 与 `views.ts:61` 不加保护地 `decodeURIComponent`：`[jump](#%E0%A4)` 让块渲染抛错，畸形的地址 hash 让 ViewHost 的 onMounted 抛错。(2) `web/src/node/offline.ts:66` 用 `encodeURI` 生成预缓存地址，不编码 `#` 与 `?`；文件名含 `#` 的发布文件让 `cache.addAll` 请求截断的地址，整个 Service Worker 安装失败，离线功能静默失效。`publish.ts` 中 `decodeURI` 的问题由 R-06 处理。

**证据**：探针 publish-uri.mjs。

**修法与验收**：解码失败时保留原文（做法同 `render-notebook/src/node/media.ts`）；预缓存地址按路径段 `encodeURIComponent`。web.spec 离线用例的夹具加一个名为 `chart#1.svg` 的图片与一个畸形锚点链接，断言 SW 激活、该页离线可加载且没有错误。

### R-66（minor；N-03，效率）

**问题**：presmium-sw.js 预缓存 40 个 KaTeX 的 `.ttf` 与 `.woff`（817 KB）。打包的 CSS 先列 woff2，docs/browsers.md 中的浏览器都支持 woff2，这 817 KB 每位读者首次访问都白下载。

**证据**：`web/src/node/offline.ts:57`。

**修法与验收**：`files()` 在存在同一基名（哈希之前）的 `.woff2` 时略去 `.woff` 与 `.ttf`。web/test 的离线测试断言预缓存清单中没有 `KaTeX_*.ttf|woff`，有 woff2。

### R-67（minor；效率）

**问题**：viewer 固定 katex 0.16.47，mermaid 12.2.0 要求 `^0.18.0`，网页构建因此发布并预缓存两份约 261 KB 的 KaTeX；同时有数学与图表的页面两份都下载。

**证据**：`viewer/package.json:16`；node_modules/.pnpm 中有 katex@0.16.47 与 katex@0.18.10。

**修法与验收**：viewer 的 katex 改为 0.18.10（用到的 `renderToString` 与 `katex/dist/katex.min.css` 不变）。构建产物中只有一个 katex chunk；content.spec、viewer.spec 的数学用例通过。

### R-68（minor；N-02，效率）

**问题**：逐步高亮时 CodeView 的 html 计算依赖高亮行，每一步都用 Shiki 对整段代码重新分词；83 行的 bpe.py 每步 5.45 ms，其中分词 3.09 ms，位于放映与滚动叙事切换步骤的热路径上，CPU 越慢越明显。

**证据**：`viewer/src/code.ts:34`。

**修法与验收**：`hast` 只依赖代码与语言（`codeToHast`），`html` 在缓存的树上给行 span 设置 `line highlighted` 或 `line` 类后用 hast-util-to-html 输出（已是 viewer 的依赖）。现有高亮用例通过；perf.spec 的步骤切换用例仍小于 100 ms（评审者测得每步 0.68 ms）。

### R-69（minor；K-04）

**问题**：单独移除（v-if、v-for）的 v-click 元素在指令的 `unmounted` 钩子运行时已脱离 DOM，`closest('.pm-block')` 为 null，规格留在块的 specs 中：泄漏脱离的元素（实时更新改变 PmHint、PmSpotlight 的 `v-for … v-click` 时），并让为 Slidev 写的相对点击多算一个，之后的步骤整体错位。

**证据**：`viewer/src/clicks.ts:94`。

**修法与验收**：在 `beforeUnmount` 中注销，或注册时用 WeakMap 记住每个元素的控制器。viewer.spec 用一个 v-for 数量随实时更新变化的夹具组件，更新后后续相对点击的步骤不变。

### R-70（minor；P-20、K-11）

**问题**：现场运行期间实时更新改了代码块，监听器清空了 `live`，挂起的 `await target.run(...)` 结束后仍写入结果，新代码下显示旧代码的输出，直到再运行一次。

**证据**：`viewer/src/code.ts:159,169`。

**修法与验收**：运行开始时记住代码（或运行序号），代码已变或有更新的运行时丢弃结果；可选把 AbortSignal 传给 `Executor.run`，代码变化或卸载时中止。viewer.spec 的 dev 用例：运行一个慢代码块期间修改它，运行结束后不显示旧输出。

### R-71（minor；效率）

**问题**：每个活动的聚光灯或提示在显示期间每帧调用 `getBoundingClientRect`，常常持续几分钟，讲者的机器无法空闲（电量、风扇），而目标只在缩放或幻灯片过渡时移动。

**证据**：`addon-guide/src/client/cue.ts:71`。

**修法与验收**：位置连续约 30 帧不变后停止循环，在 window resize、幻灯片的 transitionrun 与 transitionend、look 变化时重新开始。guide.spec 现有用例通过；加一个断言：提示显示 2 s 后，1 s 内的 rAF 回调次数为 0（注入计数器）。

### R-72（minor；N-07、依赖准则 5.4.1）

**问题**：(1) zh-CN 文稿中 VitePress 的屏幕阅读器标签（“Sidebar Navigation”、“Pager”等）仍是英文。(2) 网页主题 CSS 依赖 VitePress 默认主题的内部 DOM：`.VPNavBar .container > .title`、`.VPNavBarTitle a.title > span`、`.VPSidebarItem.level-1 > .item .text`，它们来自 GAP-06 与 WP-61 的改动，没有列入 architecture 9.1，侧栏字重的规则没有用例守护。

**证据**：`web/src/client/style.css:13-34`；`grep -r 'VPNavBarTitle\|VPSidebarItem' vendor/docs/vitepress` 无结果；`vendor/docs/vitepress/reference/default-theme-config.md` 记载了 `sidebarMenuLabel`、`docFooter` 等主题标签。

**修法与验收**：site.ts 按文稿语言设置 vendor 文档中存在的全部主题标签；能用文档化手段（CSS 变量、布局插槽、themeConfig 中侧栏项的 class）替代的选择器就替代；保留的选择器与守护用例（长标题用例 `web.spec.ts:558`，侧栏字重加一条断言或删去该规则）写进合并说明，由 70d 写入 9.1；Slidev 与 VitePress 没有公开接口的英文文字由 70d 记入 5.7 与 N-07。web.spec 断言中文文稿中侧栏与翻页的 aria-label 为中文。

### R-73（minor；复用）

**问题**：`addon-core/src/client/start.ts` 与 web 的 `theme.ts` 的 startKernel 各自用相同的 `beforeStart` 提供四个宿主服务（`PRESENTER_PANELS`、`SYNC_TRANSPORTS`、`NAVIGATION`、`TOOLBAR`）并接上 pagehide。新增宿主级服务要改两处，一种形态可能漏掉。

**修法与验收**：`@presmium/host` 增加 `startHost({ mode, config, navigation, transports })`，提供四个服务并接上 `stopPresmiumOnPageHide`；两个适配器调用它并传入各自的导航与传输。core.spec、web.spec 的启动报告用例通过。

### R-74（minor；简化）

**问题**：`BLOCK_CONTEXT`、`BlockContext`、`useBlockContext` 以及 BlockView 中的 `local` 计算与 provide 无人使用，它们是 host `useStepScope`、`useStepState` 之外的平行路线（architecture 4.4 已警告再次减去 at 是错的），每个块还要多建两个 toRef、一个 computed 与一次 provide。`addon-core/style.css:1-4` 仍以“Form markers (architecture §5.6)”隐藏 `[doc-only]`，而 5.6 说这些标记已不再使用。

**证据**：`grep -rn 'BLOCK_CONTEXT\|useBlockContext'` 只有 `block.ts:74-75`、`context.ts:13-35` 与 `index.ts:32` 的再导出。

**修法与验收**：删除上述导出、类型与 provide，删除 `[doc-only]` 规则。pnpm test 与 e2e 通过，上述代码已不存在。

### R-75（minor；K-07）

**问题**：architecture 5.1 记载的视图插件故障隔离（一个视图插件抛错不影响其他插件）在 `viewer/src/plugins.ts:32-43` 中实现，但没有测试。

**修法与验收**：viewer.spec 加一个 setup 抛错的夹具视图插件，断言其他插件的视图仍出现在视图菜单中，启动报告标记该插件失败。

### R-76（minor；N-02）

**问题**：实测帧率达标（网页放映光标 61 fps，滚动叙事 60 fps，幻灯片翻页加光标 54 fps、有一帧 100 ms），但 N-02 的 60 fps 部分没有测试，perf.spec 只断言 100 ms 内渲染步骤与 2 s 内首屏。

**修法与验收**：perf.spec 记录 `?view=present` 中引导光标移动与 Slidev 翻页期间的 rAF 间隔，断言 p95 不超过 20 ms（容许无头浏览器的抖动）。

### R-77（minor；测试，复用）

**问题**：`e2e/fixtures/core/deck.ts` 与 `web/deck.ts` 几乎相同（`presmium()` 相同，`serve()` 只差 `web/deck.ts:77` 的 `closeAllConnections` 修复），二者又复制了 `fixtures/deck.ts`；`viewer.spec.ts:230-272` 有第四份 serve 与 buildFixture。在 `examples/demo/.presmium` 下建文稿目录的写法出现 10 次；启动 `presmium dev` 并等待地址行在 `core.spec.ts:107` 与 `viewer.spec.ts:379` 重复；`openSlide` 在 code.spec 与 exec.spec 重复；`web/deck.ts` 重新声明 IR 类型。一处修复（如 closeAllConnections）到不了其他副本。

**修法与验收**：按 C-19 扩展 `e2e/fixtures/deck.ts`（`buildFixture` 的 `link` 与 `bases` 选项、统一的 `serve()`、`deckDir`、`startDev`、`openSlide`）；`core/deck.ts`、`web/deck.ts` 成为薄包装或删除；viewer.spec 改用 `buildFixture('viewer/myst', { to: ['web'] })`；IR 类型从 `packages/kernel/src/ir.ts` 导入（同 preview.spec 的做法）。本组拥有的 spec 全部通过，上述副本已删除。

## WP-70c（课堂、内容与发布）

拥有：`packages/addon-session`、`packages/addon-classroom`、`packages/classroom-server`、`packages/addon-content`、`packages/addon-publish`、`e2e/session.spec.ts`、`e2e/classroom.spec.ts`、`e2e/content.spec.ts`、`e2e/publish.spec.ts`、`e2e/fixtures/session`、`e2e/fixtures/plugins`、`e2e/fixtures/content`、`e2e/fixtures/publish`

本组在约定中的部分：C-2（session、classroom、content、publish 的迁移与编译时文本）、C-3 与 R-41（替换本组包中的副本）、C-4（本组 8 个组件）、C-6（使用）、C-7（`PmMedia` 改为声明 `assets`）、C-9（`SessionBadge` 与网页黑屏断言）、C-12、C-16（使用）、C-20（迁移测试）、C-21（使用）。

### R-18（major；P-62，学习者）

**问题**：放映视图中学员的课堂徽章（fixed，右下 1rem，z-index 2000）压在放映控制条上：跟随时挡住“全屏”“退出放映”；自主浏览时徽章更宽，还挡住“下一步”“总览”“演讲者窗口”。在手机上，被拉进放映视图的学员无法用触摸退出放映或打开总览。

**证据**：`addon-session/src/client/SessionBadge.vue:63-66`。探针（1280x800 与 375 px iPhone 13）：点击“退出放映”报 `<button>自主浏览</button> from <div class=pm-session-badge> intercepts pointer events`。session.spec 只用键盘操作放映视图，所以没有发现。

**修法与验收**：按 C-9 用 `--pm-overlay-bar` 让徽章避开控制条。session.spec 在 1280 与 375 isMobile 下：跟随的学员在放映视图用鼠标点“退出放映”成功；切到自主浏览后点“下一步”与“总览”成功。

### R-19（major；P-60、P-64、P-62）

**问题**：课堂成员身份（含唯一能结束、归档、开测验的主讲凭据）只存于标签页的 sessionStorage。(1) 主讲关闭标签页、标签页崩溃或浏览器重启后，同一浏览器的新标签页显示“未加入”，只能创建新课堂；打开加入链接会成为学员。原课堂再也无法结束或归档，学员一直显示“正在跟随主讲”，房间留在服务端内存。(2) 学员关掉标签页后用同一名字重新加入，每次 join 都抽取新的参与者 id，测验把同一个人计两次，参与者列表却只有一个“小明”。(3) 自主浏览的学员刷新后被切回跟随并拉到主讲的位置。

**证据**：`addon-session/src/client/plugin.ts:14`（window.sessionStorage）、`classroom.ts:72`（STORAGE_KEY）、`classroom.ts:322`（enter 总是设 follow）。探针：新标签页“课堂 未加入”；重新加入后“已作答 2 人，答对 2 人”而参与者为“T（主讲）, 小明”；自主浏览刷新后为“正在跟随主讲”。

**修法与验收**：成员身份（server、room、me、key、claim、follow）按文稿 base 与房间同时存入 localStorage，离开或归档时删除；没有主讲窗口响应 who 握手时，课堂面板提供“以主讲身份回到课堂 <room>”，调用 `enter(membership)`（服务端重连时已接受同一凭据）；加入链接指向本浏览器已属于的房间时恢复原参与者；`resume()` 恢复跟随模式。session.spec：创建课堂、关闭页面、在同一上下文开新页以主讲身份回到课堂，然后结束并归档成功；学员作答、关标签页、重新加入、再作答，统计为 1 人；自主浏览时刷新仍为自主浏览。classroom.spec 中“Another tab … joins as another participant”一步改为预期同一参与者。

### R-20（major；P-60、P-61，课堂服务端写入规则）

**问题**：`admissible()` 只检查更新此刻整合进探针文档的部分。(1) 学员发送一个不含结构、删除集覆盖主讲客户端未来时钟的更新，它在探针中处于 pending，`transaction.changed` 为空而被接受；房间把它留在 pending 删除集中，此后主讲写的 `store:quizzes.q2`、`session.cursor` 都被删掉，迟到的学员也看不到。一个学员就能静默取消主讲之后的全部操作，也能预先删除其他学员未来的作答。(2) 反过来，服务端拒绝某个客户端的一次更新后，这个标签页之后的合法写入都依赖被拒的结构而永远 pending；覆写中的删除部分却生效，学员先前的条目被抹掉；重连时同步步骤 2 再次发送被拒内容又被拒；学员自己的界面仍显示写入成功。写入规则（键含参与者 id，值带 participant 或 author）不在 ClassroomStore 契约中，`put()` 不报失败，第三方插件按别的形状存学员数据会被静默丢弃。

**证据**：`classroom-server/src/index.ts:170-208`；`kernel/src/contracts.ts:377-383`。探针 pending-ds.mjs：“presenter sees q2: undefined cursor: undefined”；poison.mjs：越权写入之后的合法作答主讲看到 undefined，重连后仍然如此。

**修法与验收**：`admissible()` 先用 Yjs 公开 API 判断更新能否完整整合：`Y.parseUpdateMeta` 要求每个结构客户端的起始时钟等于房间当前时钟；`Y.decodeUpdate(update).ds` 的每个区间不超过房间时钟（或比较探针的 pendingStructs、pendingDs 在应用前后是否变化）。拒绝时以应用关闭码（如 4403）关闭该连接；会话插件收到后丢弃本地 Y.Doc，用新文档重连。写入规则由 70a 写入 ClassroomStore 的 JSDoc、由 70d 写入 architecture 4.4。server.test.ts：(a) 发送上述 pending 删除集后，主讲随后的写入保留；(b) 一次被拒更新之后，同一客户端重置后的合法更新被应用。session.spec：学员越权写入一次后再作答，主讲看到这次作答。

### R-21（major；P-60）

**问题**：被取代的 `enter()`（随后离开，或再次创建、加入）超时后仍执行失败分支并 `disconnect()` 当前的课堂。服务端不可用时加入 oldroom，再启动服务、离开、创建课堂：创建后为主讲已连接；被放弃的加入超时后状态变成 idle、offline、invitation oldroom，并显示“无法连接课堂服务”，主讲的新课堂被拆掉，旧的加入表单重新出现。连接中“离开”按钮不禁用，`resume()` 绕过面板的 busy 保护，所以“刷新进一个慢服务、离开、创建”就会触发。

**证据**：`addon-session/src/client/classroom.ts:351`；`disconnect()` 销毁的 provider 本地关闭后不再发 sync 或 closed，`synced()` 总是等满超时。探针 enter-race.mjs（真实服务，timeoutMs 3000）。

**修法与验收**：每次 `enter()` 有自己的标识，只在 `provider === connecting` 时执行 catch 中的 disconnect、error、invitation、notify，以及 synced 之后的 startSession、remember、tell；`disconnect()` 中止进行中的 `synced()`（每次 enter 一个 AbortController）。新增 `packages/addon-session/test/classroom.test.ts`（devDependency `@presmium/classroom-server`，真实服务，Node 中调用 `createClassroom`）复现上述顺序，断言超时之后仍为主讲已连接。

### R-22（major；P-64、P-67）

**问题**：学员写入共享存储的条目只校验键与 participant，值的其余部分直接被使用。一个缺 `choice` 的作答或缺 `levels` 的理解度投票，使测验（主讲始终计算统计，学员在测验关闭后计算）在每个屏幕上落入错误占位；`ClassroomPanel` 在 computed 中读 `vote.levels.length`，主讲的整个总览（提问、理解度、测验、练习）停止渲染，而主讲无法在界面上删除这个条目。带开发者工具的学员或旧版本客户端都能造成。

**证据**：`addon-classroom/src/domain/quiz.ts:68`（tally）；`ClassroomPanel.vue:31,35`；`classroom-server/src/index.ts:170-176`。探针 shape.mjs：tally 抛 “reading 'includes'”，理解度面板抛 “reading 'length'”。

**修法与验收**：classroom 的 domain 增加 `isAnswer`、`isPulseVote`、`isSubmission`、`isQuestion` 类型守卫（字符串 id、有限的 `at`、`choice` 为整数数组、`levels` 为字符串数组等），PmQuiz、PmPulse、PmExercise、PmQuestionBox、ClassroomPanel 读取集合时先过滤。classroom.spec：用原始 y-websocket 客户端以学员身份写入缺 `choice` 的作答与缺 `levels` 的投票，主讲的总览与测验统计照常显示，且不计入这两条。

### R-23（major；P-75、N-07，复用与抽象层次）

**问题**：classroom 的 notebook 扩展用 myst-to-md 自己写 Markdown，绕过 render-notebook 的 MyST 降级与媒体复制：练习说明中的 `{kbd}` 丢失，数学、下标与 `:::{note}` 保留为原始 MyST，说明中的本地图片不复制到 `media/`。它还写死“**练习**”与“# 校验：先运行上面的单元格……”，英文文稿中也是中文；另带一份 nbformat 的 `lines()`。

**证据**：`addon-classroom/src/node/extensions.ts:12-40`。探针（lang: en）：练习单元为 ``**练习**\n\nPress  and compute {math}`x^2`, H{sub}`2`O.``，同样的文字在练习之外为 `<kbd>Ctrl</kbd> … $x^2$, H<sub>2</sub>O`。

**修法与验收**：按 C-6 返回 `{ cell_type: 'markdown', mdast }` 与代码单元；标签按 C-2 取自 `MESSAGES[deckLocale(ctx.lang)]`；删除 `markdown()`、`lines()` 与 myst-to-md、vfile 依赖。addon-classroom/test/notebook.test.ts 用英文文稿断言练习单元含 `<kbd>`、`$x^2$`、`H<sub>2</sub>O` 与英文标签，说明中的本地图片出现在 `media/`。

### R-78（minor；P-60）

**问题**：服务端校验文档写入，但 awareness 更新不加检查地应用：任何连接都能用更高的时钟为主讲的客户端 id 发 null 状态，把主讲从所有参与者列表中移除；也能添加 `participant: { id: 'p0', role: 'presenter', name: … }` 冒充主讲，或改其他学员的名字。主讲面板的参与者人数与名单因此不可信。

**证据**：`classroom-server/src/index.ts:216`；`addon-session/src/domain/room.ts` 的 `participantsOf` 按 id 建列表；探针 trust.mjs：主讲看到 `{id:'p0', name:'冒充的主讲', role:'presenter'}`。

**修法与验收**：`handle()` 先解码 awareness 更新，只接受新的或本连接已控制的客户端 id（`conns` 已记录）；非主讲连接的状态中 `participant.id` 必须等于该连接已证明的参与者，role 必须为 learner；其他条目丢弃，并像被拒的文档更新一样记录。server.test.ts：冒充主讲与删除主讲状态的 awareness 更新被丢弃，主讲的参与者列表不变。

### R-79（minor；P-60）

**问题**：WebSocketServer 用 ws 默认的 100 MiB maxPayload，`ownEntry` 接受任意大小的值，提问 500 字的限制只在客户端。一个学员可以写入巨大的提问、作答或提交，服务端之后对每个学员更新都把整个房间复制进探针文档，广播给所有浏览器，并写入归档。

**证据**：`classroom-server/src/index.ts:303`、`170-176`。

**修法与验收**：maxPayload 设为 1 MiB；`ownEntry` 拒绝 JSON 长度超过 16 KiB 的值并记录。server.test.ts：超大条目被丢弃，之后的合法写入照常。

### R-80（minor；测试）

**问题**：server.test.ts 在第 104、131 行固定等待 200 ms 后断言迟到者看不到被禁止的写入；服务端还没处理这些写入时，断言也会通过，测试可能什么都没验证。服务端丢弃更新时只 `console.warn`，测试没有可等待的信号。

**修法与验收**：服务端选项增加可选的 `onDropped(room, writer)` 回调（也可用于日志），测试等待预期次数的丢弃事件后再加入。server.test.ts 中不再有固定时长的等待。

### R-81（minor；效率）

**问题**：每个参与者（及每个镜像标签页）加入时都为个人房间再开一个 WebSocket，而只有网页形态的笔记层读 `session.personal`。每个额外连接带一个每 15 s 续期的 Awareness，服务端为每个个人房间建一个 Awareness 与 3 s 定时器；60 人的课多出 60 个连接与 60 个定时器。

**证据**：`addon-session/src/client/classroom.ts:327`；`addon-classroom/src/client/use.ts:52-53`；`classroom-server/src/index.ts:65`。

**修法与验收**：第一次使用 `personal.store` 时才创建 personalDoc 与连接，`disconnect()` 照旧拆除；服务端对个人房间不建 Awareness、不发 awareness 问候。session.spec：幻灯片形态的学员只建立一个 WebSocket（`page.on('websocket')` 计数）；classroom.spec 的笔记用例通过。

### R-82（minor；P-60，扫码加入）

**问题**：服务器绑定全部网卡时打印 `ws://localhost:<port>`，文档示例是 `server: ws://localhost:1234`，加入链接与二维码用主讲自己的地址（如 `http://localhost:4173/?room=…`）。学员手机扫码打不开链接，或经局域网打开后连到自己的 localhost，显示“无法连接课堂服务 ws://localhost:1234”。没有任何提示帮主讲避开回环地址。

**证据**：`classroom-server/src/index.ts:390`；`addon-session/src/domain/config.ts`、`domain/links.ts` 的 `joinUrl`；`e2e/fixtures/session/session.md:16`。

**修法与验收**：配置的服务器主机是回环而页面主机不是时，用 `location.hostname` 替换；加入链接的主机是回环时，课堂面板提示“学习者的设备打不开这个地址，请用局域网地址打开文稿”（含 en 文本）；服务器 CLI 同时打印局域网地址（`os.networkInterfaces`）。session.spec 断言回环地址下出现该提示。

### R-83（minor；学习者，静态站点）

**问题**：发布的示例讲义每页都显示灰色的“课堂 未连接”，自学者看来像出了错；点开是写给作者的说明（启动 presmium-classroom-server、设置 `presmium.session.server`）。弹层文字不换行被裁（scrollWidth 841 / clientWidth 350），Esc 与点击外部都关不掉，还挡住第一节的“笔记”按钮。

**证据**：`addon-session/src/client/SessionToolbar.vue:31-36,77-91`；`src/domain/messages.ts:42`；探针 p25.mjs（点击笔记超时，弹层的关闭按钮拦截点击）、p26.mjs。

**修法与验收**：未配置服务器时，生产构建不显示课堂入口，开发中仍显示，设置提示改为 `presmium check` 的信息诊断（见待决定 3）；弹层 `white-space: normal`、`overflow-wrap: anywhere`，Esc 与点击外部关闭（可用原生 popover 属性）。session.spec：弹层文字换行不溢出、Esc 关闭；未配置服务器的构建页面中没有课堂入口。

### R-84（minor；P-65）

**问题**：课堂结束后，练习仍提供“提交”，运行检查并给出结论，却不说明结果不会到达主讲（`PmExercise` 只在 `status === 'active'` 时存储提交）；测验、提问与理解度都显示结束状态。

**证据**：`addon-classroom/components/PmExercise.vue:60`；探针：结束课堂后练习显示“未通过 1/2”，主讲的汇总不变。

**修法与验收**：已加入且 status 不是 active 时显示“课堂已结束：结果只在本机显示，不再提交”（含 en 文本）。classroom.spec 的课堂结束用例加该断言。

### R-85（minor；P-63）

**问题**：“提问与反馈”一节中带标签的块 `(bpe-rule)=` 在幻灯片卡片内多出一个“笔记”按钮，可访问名称与提示为“笔记：bpe-rule”，即原始标签 id；读者在同一节看到两个笔记按钮。

**证据**：探针 p6.mjs：wrapup-feedback 中两个笔记按钮，名称为“笔记：提问与反馈”与“笔记：bpe-rule”。

**修法与验收**：块级笔记点只在读者悬停或聚焦该块时出现，名称取块文字的前 20 个字；所在节已有可见笔记按钮时不再渲染第二个可见按钮。classroom.spec：带标签块的节只有一个可见的笔记按钮，块级按钮的名称不含标签 id。

### R-86（minor；效率）

**问题**：NotesLayer 为页面上每个节和带标签的块各挂一个 NoteSpot（示例讲义 26 处），每个都运行 `useNotes()`，各有会话订阅、`bothStores` 与 `useCollection`；一条笔记变化，每个点都 JSON.parse 整个 localStorage 条目并过滤全部笔记。

**证据**：`addon-classroom/src/client/NoteSpot.vue:17`；`local.ts:130`。

**修法与验收**：NotesLayer 调用一次 `useNotes()` 与 `useCollection`，按节与块分组，把 notes、store、inClassroom 作为属性传给 NoteSpot。classroom.spec 的笔记用例通过。

### R-87（minor；P-64、P-65，复用）

**问题**：`parseQuiz` 与 `parseExercise`（约 60 行）逐行用正则重新解析 Markdown。`parseQuiz` 不跟踪代码围栏，说明里围栏示例中的 `- [x] …` 会被当作选项；说明随后又用 `ctx.parse` 解析一遍。myst-parser 已经给出 `listItem.checked` 与 `code` 节点。

**证据**：`addon-classroom/src/domain/source.ts:19`；探针 tasklist.mjs。

**修法与验收**：`node/directives.ts` 调用一次 `ctx.parse(input.body)`：顶层任务列表作为选项与答案，顶层代码节点作为起始代码与检查，其余节点为说明 mdast；domain 助手改为接收 mdast，domain 仍是纯 TS。classroom 的编译测试：说明中带含 `- [x]` 的围栏示例时，选项数不变。

### R-88（minor；复用）

**问题**：练习汇总句子在 `PmExercise.vue:49` 与 `ClassroomPanel.vue:51` 用同一段代码拼接，改措辞要改两处。

**修法与验收**：`src/domain/exercise.ts` 增加 `summaryText(summary, t)`，两处调用。classroom.spec 的练习汇总断言通过。

### R-89（minor；复用）

**问题**：classroom 的 `useSession` 与 session 的 `useClassroom` 是同一个会话快照订阅，`claimNotesLayer`（classroom `use.ts:81`）与 `claimBadge`（session `use.ts:24`）是同一个“第一个实例拥有”助手；两个插件不能互相引用，两份副本的返回形状已经不同。

**修法与验收**：按 C-21 改用 host 的 `useSessionSnapshot()` 与 `claimFirst(group)`，两个插件只保留各自派生的计算。session.spec、classroom.spec 通过。

### R-90（minor；N-04）

**问题**：WebKit 全量运行中，session.spec“in the slides form a learner follows the presenter …”失败：学员页面停在 `/session`，没有跟随到第 3 页。这是功能性失败；同一轮其他两个失败是 Linux 版 WebKit 缺少音频解码器。

**证据**：`docs/browsers.md:37`。

**修法与验收**：按 docs/browsers.md 在 Playwright 的 Docker 镜像中运行 session.spec 的 WebKit 项目，定位并修复（若是引擎缺陷，记录原因）。该用例在 WebKit 中通过；70d 更新 docs/browsers.md 的记录。

### R-91（minor；P-61）

**问题**：没有测试让 `scope: 'remote'` 的 `useSharedState` 经真实课堂传输在网页形态中传递，web.spec、core.spec 用的是夹具的假设备传输。探针显示这条路径可用（主讲 +2 到达学员与迟到者）。

**修法与验收**：session.spec 或 classroom.spec 用一个基于 `useSharedState(…, { scope: 'remote' })` 的夹具组件（只读引用 `e2e/fixtures/core` 的夹具插件），断言主讲的修改到达学员与迟到者；R-08 合并后，在网页形态断言主讲按 b 时学员出现黑屏层。

### R-92（minor；K-12、P-50）

**问题**：K-12 写明 presmium-export 导出 PDF 与 PNG，但它固定运行 `slidev export --format pdf` 并强制 .pdf 文件名，`--format` 选项被拒绝（退出码 2）。PNG 只能对 `.presmium/slides/slides.md` 手动运行 slidev export（手动导出时降级内容正常）。没有测试覆盖 PNG。

**证据**：`addon-publish/src/node/export.ts:54-55`；`docs/requirements.md:149`；`node packages/addon-publish/bin/presmium-export.mjs --format png` 报 “Unknown option '--format'”。

**修法与验收**：presmium-export 增加 `--format pdf|png`，`--with-clicks`、`--range` 照传，PNG 跳过链接检查或报告链接不可检查。export.test.ts：夹具以 `--format png --with-clicks` 导出，每步一张图片，含降级组件的那页存在。

### R-93（minor；P-53）

**问题**：presmium-diff 只渲染并比较幻灯片。v0.6 起网页（VitePress 外壳加 IR 运行时）是主媒介，`{only} web` 的块、滚动叙事或文档布局、viewer CSS、VitePress 升级的变化都看不到，文稿评审与宿主升级回归都没有覆盖主要产物。

**证据**：`addon-publish/src/node/diff.ts:31-40`。

**修法与验收**：增加网页一轮：两个提交都 `--to web` 构建并服务，用 Playwright 截取每页（文档视图）与 `?view=present` 的每节，沿用同样的 pixelmatch 与报告。diff.test.ts：只改 `{only} web` 中的内容时，报告列出该网页页面。范围见待决定 4。

### R-94（minor；P-23、P-51）

**问题**：Python 在两种形态中都能离线运行（探针：等待 SW 激活、离线并刷新，运行得到 row 0..2），但没有测试。publish.spec 的网页离线用例只查文字与图表；offline.test 只用一个替身 `pyodide.asm.wasm` 检查幻灯片的预缓存清单，不是 addon-exec 实际发出的运行时；没有断言网页 SW 预缓存 `pyodide/`。

**证据**：`addon-publish/test/offline.test.ts:47`；`grep setOffline e2e` 只有 publish.spec（文字与图表）与 web.spec（搜索）。

**修法与验收**：publish.spec 每种形态加一例：打开含 `{run-panel}` 或 `{exercise}` 的页面，等待 `navigator.serviceWorker.ready`，离线并清空 HTTP 缓存，刷新，运行 Python，断言输出与 `data-executor=pyodide`。

### R-95（minor；效率）

**问题**：presmium-export 与 presmium-diff 调用 `build(…, { to: ['slides'] })`，完整运行一次 `slidev build`（Vite 生产构建）只为得到 slides.md，然后删除产物，`slidev export` 再自己服务一遍。3 张的夹具上编译 487 ms、构建约 4.8 s，每次导出与差异的每一边白费约 4.3 s，pnpm test 中共约 35 s。

**证据**：`addon-publish/src/node/slides.ts:33`；`render-slides/src/node/presmium.ts:36`。

**修法与验收**：按 C-16 改用编译器的 `prepare(compilation, { to: ['slides'], outDir })`，删除 mkdtemp 与 rm。导出结果不变；export.test、diff.test 通过，合并说明记录耗时变化。

### R-96（minor；效率，N-03）

**问题**：`remoteAssetsPass` 逐张等待下载远程图片，4 张各需 1.5 s 的图片用 6 s。失败不缓存：网络不通或被黑洞时，每次编译（每次 dev 重新编译、每次语言服务保存、每次构建）都串行等待 N × 15 s。每个 URL 还 readdir 一次目录，清理时再读一次。

**证据**：`addon-publish/src/node/assets.ts:31,55-78`；探针 assets-probe.mjs。

**修法与验收**：先收集全部节点，每个不同 URL 启动一次 `localCopy`，`Promise.allSettled` 之后按块顺序改写 URL 与报告警告（诊断顺序不变）；目录只读一次，`localCopy` 与清理共用；同一进程内缓存失败结果。addon-publish 测试：本地慢服务器上 4 张图片的总耗时接近一张；不可达地址在第二次编译时不再等待。

### R-97（minor；效率）

**问题**：`styleDiagrams` 在插件启动时就安装全文档的子树 MutationObserver，对每个插入的子树 `querySelectorAll('*')` 寻找 shadow root，即使高对比度关闭（默认）。每次翻页、VitePress 页面渲染、markmap 重绘都要遍历插入的全部元素。`code-lines.ts` 已经在关闭时断开自己的观察器。

**证据**：`addon-publish/src/client/diagrams.ts:53`。

**修法与验收**：只在开启时观察，关闭时断开，开启时 `adoptAll(document)`；与 `raiseDimmedLines` 共用一个观察器。publish.spec 的高对比度用例通过。

### R-98（minor；效率、简化）

**问题**：MarkmapView 的每次 ResizeObserver 回调都对整棵树 `setData`，重新渲染并测量每个节点，随后切换按钮的观察器又改写每个圆圈；网页中窗口缩放与侧栏开合时每帧重排整张图。addon-content 导出的 `MEDIA_KINDS` 没人使用，`presmium.ts` 手写各媒体类型。

**证据**：`addon-content/src/client/MarkmapView.vue:27,84`；`src/domain/media.ts:10`。

**修法与验收**：只在第一次 `el.clientWidth > 0` 时 `setData`，之后只 `fit`；`presmium.ts` 用 `...MEDIA_KINDS.map(mediaDirective)`。content.spec 的 markmap 与媒体用例通过。

## WP-70d（执行与代码插件、文档、示例与检查）

拥有：`packages/addon-exec`、`packages/addon-exec-local`、`packages/addon-code`、`e2e/exec.spec.ts`、`e2e/exec-local.spec.ts`、`e2e/code.spec.ts`、`e2e/fixtures/exec`、`e2e/fixtures/exec-local`、`e2e/fixtures/code`、`docs/`、`examples/demo`、`scripts/`、`.agents/skills`、根目录文件（`package.json`、`playwright.config.ts`、`vitest.config.ts`）

本组在约定中的部分：C-2（exec、exec-local 的迁移）、C-3（使用 `languageId`、`failedRun` 等）、C-4（本组 3 个组件）、C-5（删除 exec 的幻灯片扩展）、C-8（exec-local 的 `vitePlugins`）、C-10（addon-code 写入版本行号、code.spec 断言）、C-12（本组 3 个包与结构检查）、C-17（使用）、C-18（`PmStepRun` 的本地步进）、C-20（迁移测试）、C-22（`{code-ref}` 声明锚点参数）、C-24（全部文档与技能）。

### R-24（major；P-22、P-20、P-65）

**问题**：容器执行器以优先级 10（高于 Pyodide 的 0）注册进共享路由，`supports()` 对 devcontainer 能运行的每种语言（默认 python）为真，所以在有 Docker 与 devcontainer 定义的幻灯片开发服务器中，它接管全部 Python 运行。可它不遵守 RunRequest：`runRequest()` 不读 `files`，`args` 以环境变量传入，代码用 `python3 -c` 运行。PmExercise 的检查程序打开 `submission.py`、`checks.py`，它们从未写出，所有检查都以 FileNotFoundError 落为“未检查”（或读到工作区里碰巧存在的同名文件）；带 `:params:` 的执行面板与 `{monaco-run}` 报 NameError。同一份文稿构建正常、开发中失败。

**证据**：`addon-exec-local/src/node/server.ts:49-61`；`container.ts:210-219`；`src/domain/config.ts:14`（`DEFAULT_PRIORITY = 10`）。kernel 契约：files 是“程序可用的额外文件”，args“作为变量注入”。

**修法与验收**：Python 在容器中运行共用的 `runner.py`（同 `node/python.ts`：`python3 -c MAIN`，请求 JSON 走 stdin），参数成为变量，stdin 与 files 的行为一致；`runRequest()` 接受 files，写入每次运行新建的临时目录并以读写方式挂载为工作目录，工作区仍只读挂载；以环境变量传参只用于 PmLocalEnv 自己的 `localEnv.run`。local-env.test.ts：经路由运行 `checkRequest(...)` 得到通过或失败的检查结果；带参数的请求输出参数值。

### R-25（major；P-22，网页形态）

**问题**：容器中的现场运行只在 Slidev 开发服务器中可用。`presmium dev --to web`（网页预览与日常放映）下 PmLocalEnv 一直未连接，只能导出，而 architecture.md:190 把“开发服务器下的本地容器”列为执行器之一。`presmium dev --to slides` 可用但没有测试：local-env.test 直接对构建产物 `.presmium/slides` 运行 slidev。

**证据**：`addon-exec-local/setup/vite-plugins.ts` 只经 Slidev 的 `defineVitePluginsSetup` 注册 `localEnvServer`，`packages/web/src` 中没有对应钩子。探针 p22dev.mjs：网页开发服务器中 `data-state=disconnected`、提示“开发服务器没有提供本地环境接口”；幻灯片开发服务器中已连接，“在容器中运行”输出 container 3.12.13。

**修法与验收**：按 C-8 从 `./presmium` 返回 `localEnvServer`，`setup/vite-plugins.ts` 保留为幻灯片形态的薄适配。local-env.test 启动 `presmium dev --to web`，断言 `/__presmium/exec-local/status` 为已连接、一次运行返回容器的输出；对 `presmium dev --to slides` 做同样的断言。

### R-26（major；K-07 作者侧，ir.md 2.5、architecture 5.2）

**问题**：分节 `{config}` 的机制对夹具插件有效，但没有一个发布的插件读取分节配置。文档的示例（“一个慢的例子”一节中的 `presmium.exec: { timeoutMs: 30000 }`）在编译时与浏览器中都不起作用；分节的 `presmium.code: { repo }` 不改变该节的永久链接。编译时连全局的 `presmium.exec.timeoutMs` 也被忽略，固定使用 10 s 默认值。

**证据**：`addon-code/src/node/resolve.ts:95` 用 `ctx.config`；`addon-exec/src/node/child.ts:32`（`request.timeoutMs ?? DEFAULT_EXEC_CONFIG.timeoutMs`）；`addon-exec/src/client/plugin.ts:18-23` 只在内核启动时读全局配置；`grep useSectionConfig|configFor` 只在 host 适配与测试夹具中出现。探针：全局与分节都设 `timeoutMs: 1000`，`time.sleep(2.5)` 的 `:run:` 结果为 ok:true、durationMs 2521；分节 repo 改为 section-override 后永久链接仍是 bpe-demo。

**修法与验收**：addon-code 在 resolve 步骤用 `ctx.configFor(section).repo`；addon-exec 的运行指令在没有 `:timeout:` 时把（已合并分节的）`presmium.exec.timeoutMs` 写入 `code.run.timeoutMs` 与组件属性，编译时执行遵守它；PmRunPanel、PmStepRun 回退到 `useSectionConfig('presmium.exec').timeoutMs`。compile.test.ts：分节 `{config}` 的超时停住一个 sleep；addon-code 测试：分节 repo 改变该节的永久链接。

### R-27（major；N-05，讲者与学习者）

**问题**：PmRunPanel 与 PmStepRun 用 rem 固定字号（0.8rem、0.75rem），放映视图中它们的代码始终约 11 px，与屏幕无关。首次运行前，执行面板空的输出栏仍占半个网格，代码挤在窄栏里被截，幻灯片其余部分空白。手机上 PmStepRun 固定两栏（3fr/2fr），代码被截，输出每行只剩一两个词。

**证据**：`PmRunPanel.vue:119-125,176,186`、`PmStepRun.vue:115,143`。探针 p4.mjs：implement-trace 与 implement-run 在 1024x768 到 1920x1080 的每种尺寸下代码 11.2 px，普通代码 24.5 px；1920x1080 下 implement-run 的 PRE 495>455。

**修法与验收**：字号改为 em，随放映视图幻灯片的字号缩放；没有输出时不渲染 `.pm-run-panel__side`（`v-if="latest || history.length"`），代码占满宽度；PmStepRun 在窄于约 32rem 时堆叠（`repeat(auto-fit, minmax(min(100%, 20rem), 1fr))`）。exec.spec：`?view=present` 1920x1080 下执行面板与逐行执行的代码不小于 18 px 且 pre 无横向滚动；375 isMobile 下逐行执行的 pre 无横向滚动。

### R-28（major；P-21，学习者）

**问题**：在默认的文档视图中，“一行一行地看”的 PmStepRun 停在“第 16 / 16 步”，没有前进或后退的控件，旁边的讲解却说“每前进一步就执行一行代码……后退一步，输出也会退回上一步”，自学者两样都做不到。要步进只能去找滚动叙事视图，那里该节高 7251 px，第 2 到 16 步没有讲解，读者要滚过约 5600 px 的空讲解栏，1440 宽下固定的代码还被截断。

**证据**：`addon-exec/components/PmStepRun.vue` 没有自己的控件；探针 p2.mjs：节高 7251 px，每步约 400 px；IR 中 implement-trace steps=16，讲解只在第 0、1 步。

**修法与验收**：宿主以“全部展开”的最终状态渲染 PmStepRun 时（文档视图），显示本地步进器（◀ ▶ 与范围输入，可用键盘操作），只改变组件的本地帧，视觉状态是（节步骤、本地步骤）的函数（是否符合约定见待决定 2）；滚动叙事中组件内部步骤的压缩按 C-18 由 70b 实现。exec.spec：文档视图中按逐行执行的后退按钮，显示“第 15 / 16 步”及对应输出；70b 在 viewer.spec 断言该节在滚动叙事中的高度不超过（讲解步骤数 + 内部步骤数 × 0.25）屏。

### R-29（major；P-20，复用与抽象层次）

**问题**：exec 的幻灯片扩展为了把录制输出挡在组件插槽外，复制了 render-slides 的 `tag()`（属性转义与 JSON 引号）与 `fence()`，却没有 `codeLang` 映射：`{code} mylang` 写成 ```` ```text ````，`{run-panel} mylang` 写成 ```` ```mylang ````，`presmium build --to slides` 在 Shiki 处失败（“slidev build exited with code 1”）。同一条规则在网页由 viewer 的 `IN_COMPONENT` 实现，成了两套机制。PmRunPanel 与 PmStepRun 还从渲染后的 DOM 读回代码（`src/client/source.ts` 的 `slotSource`），指令已有的代码与 `code` 属性没有用上，子代码块的 `run.executor` 被忽略。

**证据**：`addon-exec/src/node/extensions.ts:20-45`；`viewer/src/code.ts:245`、`context.ts:25`、`block.ts:29`。探针 lang-deck：去掉扩展后 slides.md 的 `<PmRunPanel>` 内出现 `<div class="pm-output">3</div>`。

**修法与验收**：按 C-5 删除 PmRunPanel、PmStepRun 的幻灯片扩展及 `slidesTag`、`escapeHtml`、`fence`；exec 的指令设置 `props.code` 与运行规格，删除 `slotSource`。70d 在 ir.md 写明组件内代码的规则。compile.test.ts：`{run-panel} mylang` 的文稿 `presmium build --to slides` 成功，slides.md 中面板插槽内没有 `pm-output`；exec.spec 现有用例通过。

### R-30（major；P-80、P-11，效率）

**问题**：`symbolResolver` 每查一个名字都先广度遍历整棵语法树收集全部声明，再取第一个匹配；语言服务的补全对最多 200 个收集到的名字各解析一次。721 行、200 个声明的 Python 文件上，一次 `symbol:a.py#` 补全耗时 2041 ms，全部是语言服务线程上的同步原生调用，诊断与其他请求都排在它后面。每次编译对每个符号锚点、每个版本（工作区、HEAD、每个 pin）也付一次完整遍历。

**证据**：`addon-code/src/node/symbol.ts:58-66,115`；`language-server/src/node/anchors.ts:123`。探针：200 次解析 278-332 ms，200 次完整遍历 1577-2325 ms。

**修法与验收**：改为逐层查找、在最浅一层命中即返回的 `findDeclaration(scope, name)`（结果顺序与现在相同）；`declarations(root)` 只用于找不到时的候选列表。语言服务按 `#` 之后已输入的文字先过滤名字由 70a 视需要实现。check.test.ts 现有的符号用例通过；合并说明记录探针 symbol-probe.mjs 的前后耗时（评审者测得 2041 ms 降为 323 ms）。

### R-99（minor；P-20、P-65）

**问题**：Pyodide worker 对每次运行复用同一个解释器与工作目录：一次运行写的 `data.txt` 被另一个块读到；`sys.setrecursionlimit(60)` 让之后无关的递归 RecursionError。编译时每次运行是新进程、新临时目录，于是录制的降级输出与现场输出不一致；一个学员的练习提交（如替换 `builtins.print`）会破坏该窗口之后的全部运行、追踪与检查，直到超时重建 worker。

**证据**：`addon-exec/src/runner.py:19`；探针 pyodide-state.mjs。

**修法与验收**：在 `_pm_run`、`_pm_trace` 中，写入文件前 `os.chdir(tempfile.mkdtemp())`，finally 中恢复并删除目录；快照并恢复 `sys.getrecursionlimit()`、`sys.path`、`sys.modules` 的键集合（删除本次首次导入的模块）与 `builtins.__dict__` 的副本。exec.spec：先运行写文件并降低递归限制的块，再运行另一个块，结果与编译时一致。

### R-100（minor；P-22、P-26）

**问题**：`localEnvPass` 只定一个工作区（配置的，或第一个写了 `:workspace:` 的块），并交给开发服务器的运行与提交接口；但每个块的归档按自己的 `:workspace:` 生成。第二个块指定另一个工作区时，导出用它自己的 devcontainer，运行却用第一个工作区的镜像，提交把片段写成第一个工作区仓库的新分支（可能是另一个仓库），没有任何提示。

**证据**：`addon-exec-local/src/node/pass.ts:80-88`；`server.ts` 的 `handle(workspace, …)`。

**修法与验收**：`{local-env}` 块解析出不同工作区时报告错误（checkId `presmium.execLocal.workspace`），点名两个工作区。local-env.test：两个块指定不同工作区时得到该诊断。

### R-101（minor；P-22，效率与正确性）

**问题**：每次容器运行都重新探测 Docker（45 ms）并 spawn `devcontainer read-configuration`（149-220 ms，一个 Node CLI 进程），每次点击“运行”多约 200 ms；`supports()` 与 `fingerprint()` 对每个代码块重新解析 devcontainer.json 并读取、哈希 `.devcontainer` 中的每个文件。`devcontainerCli()` 没有超时或中止，镜像的 Promise 被缓存：一次卡住的构建（如死网络上拉基础镜像）让之后同一定义的所有运行永远等待，PmLocalEnv 的按钮一直禁用；客户端的中止只传到最后的 `docker run`。

**证据**：`addon-exec-local/src/node/container.ts:36,103-134,187-188`；`server.ts:71-77`。

**修法与验收**：按 `definitionStamp(findDefinition(workspace))` 缓存 `readDevcontainer`、`definitionRunners`、`definitionHash`，异步 Docker 探测也缓存；`devcontainerCli` 传 `timeoutMs`（read-configuration 60 s、build 10 min）与请求的 signal；`runProcess` 在 SIGTERM 之后的宽限期结束时 SIGKILL。local-env.test 现有用例通过；加一例：Dockerfile 中 `RUN sleep` 加很短的构建超时，运行以超时失败，下一次运行重新构建而不是永远等待。

### R-102（minor；效率）

**问题**：exec 插件没有 `dispose`。`stopPresmium` 在 pagehide 与 HMR 时运行，往返缓存恢复时重新启动内核，`setup` 新建执行器，首次运行时再起一个 worker；旧 worker 一直保留已加载的运行时（9.6 MB wasm 加解释器堆）直到标签页关闭。

**证据**：`addon-exec/src/client/plugin.ts:15`；`pyodide.ts:35`。

**修法与验收**：`createPyodideExecutor` 提供 `dispose()`（终止 worker、清空 traces、重置 queue），`execPlugin.dispose` 调用它，做法同 session 与 classroom 的 cleanup。exec.spec：触发 pagehide 再恢复后运行一次，页面只有一个 Pyodide worker（`page.workers()` 计数）。

### R-103（minor；效率）

**问题**：每个 PmStepRun 一挂载就加载并启动 Pyodide 追踪代码。文档视图中一页的各节同时挂载，打开含逐行执行的页面（示例讲义 `pages/implement.md:30`）就在 worker 中实例化 `pyodide.asm.wasm`（9.6 MB）、`python_stdlib.zip`（2.5 MB）并运行追踪，耗费数秒 CPU 与几十 MB 内存，即使读者从未滚到那里。

**证据**：`addon-exec/components/PmStepRun.vue:58`。

**修法与验收**：文档模式（`usePresentationMode() === 'document'`）下，组件接近视口时（带 rootMargin 的 IntersectionObserver）或其步骤第一次大于 0 时才开始追踪；幻灯片保持现在的立即追踪，视觉状态仍是步骤的函数。exec.spec：打开含逐行执行的页面而不滚动，没有请求 `pyodide.asm.wasm`；滚到该节后追踪完成。

### R-104（minor；P-20、P-75，复用）

**问题**：三份 Python 语言别名表互不一致：exec 的 `isPython` 认 python、py、python3；render-notebook 的 `LANGUAGE_ALIASES` 映射 py、python3、ipython、ipython3；exec-local 的 `languageId` 只映射 py。结果 python3 代码在 Pyodide 中运行，本地容器却从不认领（`DEFAULT_RUNNERS` 只有 python）；ipython 块经 render-notebook 是代码单元，经 exec 的 `notebookCell` 却是 Markdown 单元。exec 与 exec-local 的 notebook 扩展在 `renderers.notebook.kernel` 是其他语言时仍输出 Python 代码单元。

**证据**：`addon-exec-local/src/domain/workspace.ts:7`；render-notebook 的 `language()` 与 `options.kernel.language` 比较。

**修法与验收**：按 C-3 使用 kernel 的 `languageId`；notebook 扩展与绑定的 RenderContext 中的内核语言比较，不写死 Python。compile.test.ts：ipython 块在两条路径下都是代码单元，内核为 JavaScript 时 Python 面板成为 Markdown 单元；local-env.test 在有 Docker 时断言 python3 块被容器执行器认领。

### R-105（minor；P-20，architecture 9.3 遗留）

**问题**：9.3 记录的两种执行边界情况仍未处理。(1) 浏览器端运行器只在运行期间监听未处理的 Promise 拒绝，运行末尾才触发的拒绝与定时器中的异步异常被漏掉：同一段代码浏览器中退出码 0，编译时为 1。(2) 用户代码调用 `console.dir`、`process.stdout.write` 或留下永不结束的顶层 await 时，Node 子进程的 JSON 结果被破坏，或录制的 stderr 含临时路径。

**证据**：`docs/architecture.md` 9.3 第 1、2 行；`addon-exec/src/runner.mjs:108-121`。

**修法与验收**：运行器在判定结果之前等待已登记的定时器与微任务清空；Node 子进程改用独立的结果通道（如 fd 3）。compile.test 与 exec.spec 各加用例：延迟拒绝的 Promise 在编译时与浏览器中退出码都为 1；调用 `process.stdout.write` 与 `console.dir` 的代码被完整录制。然后从 9.3 删除这两行。

### R-106（minor；K-12、P-75，architecture 9.2、9.3 遗留）

**问题**：插件的 IR 步骤都在编译时执行之前运行，执行面板生成时代码还没有执行，所以它的 fallback 只有代码与 `:recorded:`。没有 `:recorded:` 的面板在 PDF、PNG 导出中只显示代码，`:params:` 的取值也不显示。

**证据**：`docs/architecture.md` 9.2 第 4 行、9.3 第 3 行。

**修法与验收**：按 C-17，执行插件在 `after: 'execute'` 阶段把编译时输出与参数写入执行面板的 fallback。compile.test.ts：以 `:run:` 编译执行、没有 `:recorded:` 的面板，IR 的 fallback 含输出与参数；然后从 9.2、9.3 删除对应行。

### R-107（minor；P-10，作者）

**问题**：ir.md 没说锚点路径相对 git 仓库根目录（workspaceRoot），其示例 `region:src/bpe.py#merge` 看起来像相对文稿。按文稿相对或按示例写时报“src/bpe.py not found”，提示却是“restore the #region markers … or fix the anchor”，不提路径基准。

**证据**：`compiler/src/workspace.ts:10-12`（`git rev-parse --show-toplevel`）；探针：只有 `region:examples/sample-repo/src/bpe.py#…` 能解析。

**修法与验收**：文件缺失时报告“not found under <仓库根>; anchor paths are relative to the repository root”，`<deckDir>/<path>` 存在时给出相对仓库根的写法；ir.md 5.1 写明基准（仓库根，不在 git 中时为文稿目录）。check.test.ts 断言该消息与建议。

### R-108（minor；简化）

**问题**：addon-code 只有 Node 代码（没有组件与客户端代码），却声明 `@presmium/host` 与 `vue` 依赖，从不导入。

**修法与验收**：删除这两项依赖。pnpm test 通过。

### R-109（minor；P-15、P-16、P-21）

**问题**：网页放映（P-76 的日常放映视图）中逐步高亮、版本切换与逐行执行都可用（探针：高亮依次落在 `if (items.length ===`、`const subtotal`、`` return `total: ``，版本依次为 6e4072a、c4c6310、f6960cc；逐行执行前进到第 5 行、后退恢复第 4 步），但没有 e2e 覆盖：code.spec 的网页部分只查链接与来源栏，exec.spec 没有网页的逐行执行用例。

**证据**：`e2e/code.spec.ts:85-99`。

**修法与验收**：code.spec 加网页放映的逐步高亮与逐步版本，并按 C-10 断言每一步来源栏的文件链接与行范围；exec.spec 加网页放映中逐行执行的前进与后退。

### R-110（minor；分层，architecture 第 3 节）

**问题**：`scripts/check-layering.mjs` 漏掉架构表中的几条规则：(1) web 的 components 与 src/client 可以导入 `@slidev/client`（web 与 addon-core 一起被豁免，而只应豁免 addon-core）；(2) `setup/` 与全局图层可以导入任意 `@slidev/*`（如 `@slidev/parser`）；(3) `src/domain` 可以导入 `@vue/*`；(4) 渲染端与运行时包（web、render-slides、render-notebook、viewer）可以导入 `@presmium/slidev-addon-*`；(5) 不扫描 `.tsx`、`.jsx`。现有代码没有违规，但回归不会被发现。

**证据**：`scripts/check-layering.mjs:24`（`except: ['addon-core', 'web']`）与 `:37` 的文件正则。在脚本副本上植入上述 6 个文件，结果为“layering ok”。

**修法与验收**：拆分 `@slidev/client` 规则，web 只豁免 vitepress 禁令；setup/ 与全局图层只允许裸 `@slidev/client` 与 `@slidev/types`；domain 规则把 `^@vue/` 当作 vue；插件互不引用的规则适用于示例与测试以外的全部包；文件正则加 tsx、jsx。用上述植入文件验证每条规则都失败，删除后通过。

### R-111（minor；K-07）

**问题**：Node 插件的版本与内核范围检查存在但是可选的，13 个官方 Node 入口（`./presmium`）都没有声明 `version` 与 `kernel`；内核升级后官方插件都会不经检查加载。浏览器端的清单已声明 `kernel: '^0.1.0'`。

**证据**：`compiler/src/plugins.ts:52`（字段缺失时跳过检查）；`kernel/src/contracts.ts:232-240`；`grep "kernel:" packages/*/src/node/presmium.ts` 只命中 render-notebook 的 Jupyter 内核选项。

**修法与验收**：按 C-12 各组声明；本组新增结构检查（每个导出 `./presmium` 的包都声明 `kernel`），并入 `pnpm test`，随本组最后合并。检查在合并后通过，删除任一声明时失败。

### R-112（minor；文档与代码一致：architecture.md）

**问题**：(1) 9.4 说“Skip to content”、明暗切换提示与 404 页仍是英文，由 WP-61 处理，实际已本地化并有测试。(2) 9.5 的两项派给已合并的 WP-61，由 R-08 修复。(3) 第 6 节仍描述旧示例（`title: Presmium Demo`、每个上下文独占 `examples/demo/pages/<ctx>.md`），实际是 BPE 讲义，功能用例在 `e2e/fixtures/<组>`，`.presmium` 只有 freeze 与锁文件。(4) 第 8 节 K-09 一行引用 e2e/stage.spec.ts，仓库写回的测试是 `addon-stage/test/drawings.test.ts`。(5) 5.1 的视图插件成员表缺少 `registerAction` 与 `registerLayer`，插件作者无从知道。(6) 9.1 缺 R-72 的 VitePress 选择器与 Slidev 绘图的文件命名（`<page>.svg`，`addon-stage/setup/vite-plugins.ts:21`、`setup/main.ts:10` 依赖 `drawingState` 的形状）。

**证据**：`docs/architecture.md:291,302,338,380-385,408-425`；`web/src/domain/messages.ts:33-35`；`viewer/src/plugins.ts:8`。

**修法与验收**：逐项改正，并按 C-24 写入各组的契约（4.4、5.1、5.4、5.7、5.9、9.1 的守护用例、9.3 删除已修复的行，9.2 按待决定 8 处理）。文档与合并后的代码一致；第 8 节引用的测试文件都存在。

### R-113（minor；文档与代码一致：wbs.md、ir.md、命令）

**问题**：wbs 的通用完成标准 2 仍要求每个包的 `examples/demo/pages/<ctx>.md`，WP-62 之后已不存在；WP-60 至 WP-63 的标题缺少“（已完成）”。ir.md 第 7 节说 `presmium check`“编译到第 8 步，只输出诊断”，实际还运行各插件的检查，并有 `--json`、`--update-lock`；`presmium dev --out` 未记载；presmium-export、presmium-diff、presmium-classroom-server、presmium-language-server 及其选项不在任何命令表中。

**证据**：`docs/wbs.md:29,392,409,423,437`；`docs/ir.md:289`；`cli/src/check.ts:33-60`、`cli.ts:13-31`；`addon-publish/package.json:42-45`。

**修法与验收**：完成标准 2 改为夹具文稿的约定，标记 WP-60 至 WP-63 完成；ir.md 第 7 节与 `cli.ts` 的 USAGE 一致；在 architecture 第 2 或第 7 节加辅助命令表。同时按 C-24 写入作者可见的新内容，并同步更新 `.agents/skills` 的三个技能（P-82）。pnpm test 中的技能检查通过；文档与 USAGE 一致。

### R-114（minor；P-72）

**问题**：requirements 的 P-72、`wbs.md:121` 与 `browsers.md:47` 仍要求“上一节与下一节”。WP-61 已有意改为按章分页的“上一章、下一章”（`wbs.md:417`），e2e 断言不存在节间链接（`web.spec.ts:156`），单文件文稿因此没有上一节、下一节导航。

**修法与验收**：三处改为“上一章与下一章（按章分页）”，并在需求变更记录中记下这一决定。

### R-115（minor；ir.md 2.5、P-76）

**问题**：文档示例的提示 `slides: { layout: two-cols }` 生成的幻灯片内容全在左栏、右半空白：Slidev 的 two-cols 需要 `::right::` 插槽标记，MyST 与幻灯片渲染端都写不出来。

**修法与验收**：ir.md 的示例改为不需要插槽的布局（如 `layout: center`）。

### R-116（minor；学习者，示例讲义）

**问题**：(1) `wrapup.md:185`“词表大小是唯一需要我们决定的量，它在词表大小和序列长度之间做取舍”自相矛盾。(2) 封面说“讲义里的示例可以直接在浏览器中运行”，而本章的分词演练场是假的：只读输入框加两个无反应的蓝色按钮，还请读者“打开词表查看”；讲义从不让读者运行刚讲过的 train、encode、decode，执行面板用的是另一个简化循环。(3) notebook 中演练场是空的：文稿自己的 `<style>` 在光标点击前隐藏 `.bpe-playground__output p`，notebook 没有光标，却写着“点击之后，结果出现在下方”。

**证据**：`examples/demo/pages/wrapup.md:185`；`examples/demo/pages/encode.md:38-46,108,137`；nbconvert 后 `.bpe-playground__tokens` 的 visibility 为 hidden。

**修法与验收**：改写该句（如“词表大小是唯一需要我们决定的量：词表越大，序列越短，但模型要为更多词元学习参数。”）；光标演示之后加一个 `{run-panel} python`（`:params: {text: slowest}`），用 sample-repo 中 bpe.py 的 train、merge、encode 打印 `encode(text, train(corpus, 266))` 的词元；假按钮标为示意（disabled、aria-disabled）或删去“可以打开词表查看”；隐藏规则限定到有光标的运行时（`:is(.pm-section, .pm-present, .slidev-layout) .bpe-playground__output p`）。`pnpm demo:build` 与 `pnpm demo:check` 无错误，smoke.spec 通过；nbconvert 后演练场结果可见。

## 删除的条目

- simplify:plugins 的“addon-stage 声明但不导入 `@presmium/host`”：R-08 之后舞台插件使用 host 的 `useSharedState`，该依赖会被用到（同一条中 addon-code 与 `MEDIA_KINDS` 的部分保留为 R-108、R-98）。
- accept:ux N-04 的“增加 CI 任务运行 WebKit 冒烟”：仓库没有 CI 配置，WebKit 的运行方式已记在 docs/browsers.md；其中的功能性失败保留为 R-90，人工检查转为待决定 7。
- accept:kernel K-12 与 accept:plugins-b P-50 中“把 K-12 收窄为手动 slidev export”的备选：采用 R-92 的实现方案。

## 决定

验收者（主代理）对待决定事项的决定，各工作包按此实现：

1. **R-10 默认 base**：采用。同时构建网页与幻灯片且都未设 base 时，默认 `/web/` 与 `/slides/`，`dist/` 整体作为一个站点部署；只构建一种形态时仍为 `/`。70d 在 ir.md 与技能中写明。
2. **R-28 本地步进器**：采用。读者的本地步骤与执行结果一样是读者输入，组件状态是（节步骤，本地步骤）的纯函数，仍然可逆；70d 在 architecture.md 5.3 节补充这条约定。
3. **R-83**：未配置课堂服务时，发布的网页隐藏课堂入口；开发中显示设置提示，`presmium check` 给出同样的提示（信息级）。
4. **R-93**：覆盖网页形态，复用 Slidev 导出已经需要的 playwright-chromium，不新增运行时依赖。
5. **首选执行器的统一**：不在 WP-70 处理，并入 WP-73：v0.7 的 `:env:` 依赖它（`design-v0.7.md` 4.2 节）。规则定为 `RunRequest.executor` 精确匹配，指定的执行器不可用时返回失败，由 P-24 显示录制输出，不回退到其他执行器。
6. **收缩 `@presmium/compiler` 的导出**：全部包都是 `private`，没有发布，采用：只保留仓库内有使用方的导出（R-119）。
7. **N-04 的验证方式**：修订为自动化与人工两部分：冒烟用例在 Chromium、Firefox 与 WebKit（Playwright，近似 Safari；Edge 为 Chromium 内核）中运行，WebKit 未安装时跳过并提示；真实的 Safari、Edge 与前一个主版本在发布前按 `docs/browsers.md` 人工检查（R-120）。
8. **architecture 9.2 的其余设计取舍**：留给 WP-72，与 v0.7 的设计一起处理。

## 补充条目（来自技能编写 WP-71）

### R-117（minor；文档，归 WP-70d）

**问题**：`{youtube}`（addon-content，选项 `:start:`、`:width:`、`:height:`）没有写进 `ir.md` 5.1 节；“重新构建后要重启静态服务器（sirv 缓存文件列表）”只记在技能中，仓库文档没有。

**修法与验收**：ir.md 5.1 列出 `{youtube}`；architecture.md 第 7 节（或 browsers.md）写明静态服务器的重启。`scripts/check-skills.mjs` 与文档一致。

### R-118（minor；P-76，归 WP-70a）

**问题**：幻灯片形态的控制台报 “Failed to patch FloatingVue”。

**修法与验收**：查明来源（生成的 Slidev 项目配置、依赖版本或插件），修复或在 architecture.md 第 9 节记录为框架已知问题；smoke 用例断言幻灯片形态打开时控制台没有该错误（若属框架问题则说明理由并跳过断言）。

### R-119（minor；简化，归 WP-70a，决定 6）

**问题**：`@presmium/compiler` 约 14 个导出在仓库内没有使用方。

**修法与验收**：删除没有使用方的导出（必要时改为包内使用）；`pnpm test` 与全部 e2e 通过。

### R-120（minor；N-04，归 WP-70d，决定 7）

**修法与验收**：`playwright.config.ts` 的冒烟浏览器默认包括 `webkit`（未安装时跳过并提示安装命令）；`docs/browsers.md` 与 requirements N-04 写明人工检查的范围；smoke 用例在 WebKit 中通过，或把失败记录为 R-90 的一部分修复。

另：R-92 的验收增加一条：`presmium-export --range 1-3` 只导出第 1 至 3 页（技能编写时观察到导出了整份讲义）。
