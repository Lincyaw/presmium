# @lincyaw/web

## 1.0.0-rc.7

### Patch Changes

- Updated dependencies [a2a177c]
  - @lincyaw/design@1.0.0-rc.7

## 1.0.0-rc.6

### Patch Changes

- @lincyaw/design@1.0.0-rc.6

## 1.0.0-rc.5

### Patch Changes

- Updated dependencies [502e516]
  - @lincyaw/design@1.0.0-rc.5

## 1.0.0-rc.4

### Patch Changes

- @lincyaw/design@1.0.0-rc.4

## 1.0.0-rc.3

### Minor Changes

- f3b035a: Sites take a theme of their own: `site.theme` names a theme directory or an installed theme package whose `theme.json` extends a built-in theme and sets its parameters, design tokens for the light and dark appearance, web fonts and stylesheets. Pages link the published theme files and carry `data-pm-site-theme-name`; HTML template homepages receive the stylesheets in the site data.

### Patch Changes

- @lincyaw/design@1.0.0-rc.3

## 1.0.0-rc.2

### Minor Changes

- 21189ed: A document is one web page with all its sections, as a static site shows a source file on one page. The sidebar lists the workspace's documents, grouped by each document's first tag in the workspace's order, with the current document's chapters under it; the page outline lists every section, the sections of a chapter indented; a section's title shows a `#` permalink when pointed at. The showcase theme drops its row of page buttons for the same two side columns. The pages earlier sites split a document into by chapter are built as redirects to the chapter's place on the document's page, and the dev server redirects them the same way.

## 1.0.0-rc.1

### Minor Changes

- 8e0c72f: Render animations and components inside the native document editor using isolated read-only block hosts. Load visible blocks without additional event streams, match saved source and runtime snapshots, and refresh when project code changes. Preserve native text selection and editing, provide direct runtime interaction and step-linked native caption/script editing, and share compact/touch controls and preview states through the design system.
- 432a325: Resolve complete visual states and component parameters by authored Step ID, including reverse and arbitrary navigation. Expose local-step and semantic state through the host scope and scene context. Remove the viewer's per-page authoring editors; document editing and native comments now live in the workbench's single JSON editor.
- 8008b64: Expose source and plan-bound controls and observable positions from the existing lecture player through the public host service and preview bridge. Pause before seeking, wait for real picture preparation before acknowledging, preserve the clock on repeated loads of the same plan, and reject superseded requests without starting playback. Confirmed silent plans use the existing clock; estimated plans remain unavailable for playback.
- 672d5e5: Unify the viewer, web shell, host and plugin components on React with external stores and shared React modules. Replace the Vue runtime and component sources, including generated plugin projects and examples.
  
  Add a lazy BlockNote body editor with source-preserving MyST saves and explicit narration blocks. Text pages, animation blocks and step narration share the preview protocol; narration timing and animation step navigation remain available during presentation.
- ec5afeb: 工作区服务可以放在一个路径下面：`presmium serve --public-url https://host/user/a/preview/` 时，网站、预览、导出产物与 `__presmium/` 路由都在该路径下，代理原样转发路径即可（例如 JupyterHub 的 jupyter-server-proxy）。页面的 `AppConfig.server` 给出这个前缀，`@lincyaw/host` 的服务端客户端与控制通道据此访问路由，并新增 `pluginRoutePath` 供插件拼出自己的路由；Jupyter 执行环境与课堂同步改用它。路径不同的导出不会互相复用产物。`presmium studio` 新增 `--preview-port`，并把带启动令牌的地址写进 0600 的状态文件；工作台对文稿上下文的请求改为相对地址，可在路径下工作。
- 5248460: 增加课程、文档和展示三种网站主题，以及配色、字体、正文宽度和标志配置。工作区首页可用独立的网站页面 JSON 设计封面、介绍与入口，支持引用文件或内联配置；也可使用自由 HTML、CSS、JavaScript 模板，通过 Vite 打包素材并读取注入的公开文稿集合。原有字符串 `site.landing` 继续支持将一份教学文稿的全文作为首页。教学文稿仍以 `lecture.json` 为唯一内容入口，单篇文稿可选择文章、首页或宽版布局。
  
  `presmium new --type site --theme course|docs|showcase` 创建带独立 `site/home.json` 首页、示例教学文稿和 GitHub Pages 工作流的网站项目；工作流按 Pages 基础路径构建并部署静态网站。已有项目默认保持文档主题，`site.home` 继续使用重定向行为。
  
  首页布局将整份文稿合成一张网页，译本可独立选择布局；实时切换时同步更新正文、分页与当前地址。修复仅修改译本而原文未变时预览不更新的问题，保留原文的增量更新与无变化时的通知抑制。
  
  增加完整产品站点示例：独立双语首页、共享真实线性回归模型的教学文稿与放映版，以及由 Presmium 自身制作的 60 秒产品宣传片、原创音乐和源码下载。宣传片围绕老师备课、组织步骤、比较训练结果、回看与课后探索展开，使用真实工作台和教学输出画面。实时预览支持文稿下的 `slides/` 放映入口，并正确返回当前文稿的阅读地址。
- afda9e9: The slides no longer use Slidev. They are the viewer's own slides page: each section a slide on a canvas of a fixed size (980 wide and 16:9 unless `renderers.slides` says otherwise), drawn in the Book layout and scaled as a whole, from the same prebuilt viewer app as the web form. A section's `{hints} slides:` takes `layout` (`default`, `cover`, `center`, `full`), `class` and `zoom`.
  
  - `presmium build --to slides` takes about 2 s for a lecture; `presmium dev --to slides` and the workbench's slides preview are the viewer's page with `?form=slides` (a switch from the document to the slides in the workbench takes about 0.15 s), and an edit reaches the slide as the sections it changed.
  - The exports print that page in Chromium (`playwright-chromium`, an optional peer of `@lincyaw/render-slides`): `pdf`, `png` (a picture of each slide, or of each step) and `pptx` (a picture of each slide, its narration as the speaker notes, with `pptxgenjs`). `presmium-export` and `presmium-diff` use them; `presmium-export` no longer takes `--wait`, since the page tells when it is ready.
  - The exporters' context builds a renderer's output (`ExportContext.build`, in place of `prepare`) and carries the asker's `options`; the compiler's `exportDocument` runs an exporter, for the workspace's jobs and for the command line.
  - Removed: `@lincyaw/addon-core` (the slides' host adapter; a headmatter that still lists it compiles, with a note), every plugin's `setup/` and Slidev layers, the plugins' `vitePlugins` (a plugin's `vite.config.ts` gives the viewer app's build its Vite plugins and Vue's `isCustomElement`), `Renderer.prepare`, `RenderContext.vitePlugins`, the host's `PmStepScope`, the kernel's `servedAssets`, `prebundleDependencies`, `warmDevPage` and `linkBrowserDependencies`, the publish addon's PWA build of the slides, and the slides' themes.
  - The presenter draws on the slides (`d`, or the pen in the presentation's bar: four inks, the eraser, undo, clear) with drauu: each slide's drawing is shared between the presenter's and the audience's windows and the classroom, and kept in the document's `.presmium/drawings/` while a server serves the page (`@lincyaw/addon-stage`). Viewer plugins can put layers on each slide (`scope: 'slide'`) and controls in the presentation's bar (`scope: 'bar'`).
  - A runnable code block can be edited in place before it runs (CodeMirror 6, loaded the first time a block is edited; Mod-Enter runs), and restored, in the pages and the slides alike.
- ae6b2a0: The workbench shows the web form in a prebuilt viewer, as a PDF viewer shows any PDF: no dev server per document.
  
  - `@lincyaw/web`: the viewer app (the web form's runtime with the workspace's plugins, built once into the user's cache and shared by every workspace) and each document's own code in a small bundle that imports Vue, Presmium's packages and the plugins' public subpaths through the app's import map. The workspace site serves them below `<base>__app/` (`SiteDevServer.app`); a document whose plugins bring Vite plugins of their own still goes to its dev server. A document's typography is our own stylesheet (`.pm-document`), the same on the site and in the viewer.
  - `@lincyaw/kernel`: `PresmiumNodePlugin.documentModules`, the virtual modules a plugin generates for each document, which the viewer takes from the document's bundle; `SiteDevServer.app`; `PREVIEW_APPEARANCE_PARAM` and `previewAppearance()`, so that a preview's first paint has the workbench's appearance.
  - `@lincyaw/addon-motion`: gives the document's scenes as a document module.
  - `@lincyaw/workspace`: `preview` answers the viewer's page once it is built (an opened document waits for it a while; a prefetch only starts it), else the dev server's.
  - `@lincyaw/workbench`: previews load with the workbench's appearance in their address.
  - `@lincyaw/viewer`: the page view's root has the `pm-document` class.
  - `@lincyaw/design`: `--pm-space-12`.
- d0e13b5: The web form no longer uses VitePress. One prebuilt viewer (the web form's runtime with the plugins' browser parts, built once for a set of plugins and kept in the user's cache) shows every page: in the workbench, in `presmium dev` and `presmium serve`, and in a built site, whose pages it renders on the server first and then hydrates. A document is data beside it: its IR, its own code as a small bundle, its search index, its published files. Our own site shell replaces VitePress's: header and navigation, chapters, the page's sections, pager, footer, search (MiniSearch over the IR, Chinese tokenized), languages, light and dark, the phone layout, the workspace's home page and a 404 page; it is drawn with the design tokens only.
  
  - A build of one lecture's web form takes about 2 s instead of about 25 s, and a workspace site copies the viewer once below `_app/` for all its documents; the bytes are the same in any checkout.
  - `presmium dev` and `presmium serve` start no VitePress process; an edit reaches the page as the sections it changed, and the viewer renders only those again.
  - Plugins declare the files their browser code loads while it runs as `assets` (`RuntimeAssets`: served below the document's site path and copied into a built site); the browser code finds them with the host's `siteBase()`. A document's IR is served and built as `ir.json`, its revision in the `Presmium-Revision` header of a dev server.
  - Removed: the `@lincyaw/web/client` VitePress theme export and the per-document VitePress projects.

### Patch Changes

- f8606cc: Reuse up to two loaded web preview windows when switching lectures. Inactive previews unmount document components, stop their runtime and control stream, and expire after two minutes. Resume refreshes the published IR without reloading JavaScript. Unsupported previews, changed runtime configurations, and plugins without an explicit restartable lifecycle fall back to reloading.
  
  Add optional preview activity commands and acknowledgements. Browser module packages must opt in with `presmium.preview.restartable` and kernel plugins with `PluginDefinition.restartable`, promising complete disposal followed by setup in the same window. Core and content opt in; other sources default to reloading.
  
  Validate unchanged IR snapshots with ETags and reuse a bounded cache of parsed workbench IR, avoiding repeated transfers and parsing while still checking the current revision on each request.
  
  Coalesce concurrent IR reads, revalidate saves that arrive during an earlier read, and memoize pure Markdown HAST within a bounded cache. Mounted components and background resources are never retained by this data cache.
- 720c466: Resolve canonical lecture.json document links and explicit published locale targets to their corresponding site pages, retaining the chosen language and fragment.
- ae6b2a0: Heavy outputs are compile jobs, as in Overleaf: the author or the AI starts them, sees their progress and log, and opens, plays or downloads their files.
  
  - `@lincyaw/kernel`: `PresmiumNodePlugin.exporters` (`Exporter`, `ExportContext`, `ExportOutput`); `RenderContext.log`; the jobs' types (`OutputTarget`, `CompileJob`, `JobFile`, `JobsAnswer`) and `OutputJobs`, the hosts' interface; `forEachLine` in `@lincyaw/kernel/node`.
  - `@lincyaw/compiler`: `BuildOptions.base` and `log`; `availableRenderers` and `documentExporters`; `serveDirectory` serves files through `send` (ranges, validators, conditional requests), with `?download` attachments and `origins` (CORS).
  - `@lincyaw/render-slides`: the slides as PDF or PowerPoint (`pdf`, `pptx`), for any document with the slides form; the Slidev build's output goes to the job's log.
  - `@lincyaw/addon-lecture`: the lecture as a video (`video`), with its captions and the frames' progress; `exportVideo` reports captions with their language.
  - `@lincyaw/addon-publish`: `presmium-export --format pptx`; its tools' output can go to a log, and a signal stops them.
  - `@lincyaw/workspace`: the jobs, one at a time, their files below `/__outputs/`, a revision made once; the `jobs`, `jobs/cancel` and `jobs/events` routes; the server host's `build` runs as jobs.
  - `@lincyaw/server`, `@lincyaw/mcp`: `ServerHost.jobs`; MCP `build` starts jobs (renderers and exports, `wait`), `get_builds` lists them.
  - `@lincyaw/workbench`: the Export pane; `@lincyaw/dsh` proxies the job routes and tells the AI about them; `@lincyaw/design`: the `export`, `download`, `video`, `website` and `notebook` icons.
- 01b7cee: Refresh Node services with each compilation's configuration and language, pass resolved Vite plugin entries to document and workspace renderers while keeping live saves consistent when contributors are removed, invalidate recordings with missing blobs, and consistently select and diagnose duplicate plugin components. Resolve dev output directories to their physical paths so renderer dependencies also load through symlinked output locations.
- 18bd137: 显式放映准备与新页面确认代码包对应当前工程文件；构建失败时保留正文和旧缓存，返回真实失败及文件定位，不把旧代码包作为当前已保存版本。
- 01b7cee: Publish current compilation, preview, runtime and server diagnostics through one snapshot with SSE and MCP resource subscriptions. Show concrete problems in the workbench and remove resolved or obsolete contributions without rerunning full checks when a subscriber reads the snapshot.
- 21b2143: Keep document authoring independent from presentation and video controls, with every chapter visible in one continuous authoring canvas. Restore ordinary BlockNote paragraph, list and formatting edits; make toolbar undo use the editor's own history before saved source revisions, retain stable page identities during native title edits, and preserve confirmed source bindings when restoring deleted simple blocks. Keep newer input explicit across delayed save acknowledgements and return completed writes only to their original preview instance. Retain drafts while a preview is inactive and do not replay request replies after a new handshake.
  
  Keep author tools within desktop and touch viewports, avoid covering selections with formatting or comment tools, expose only formatting that survives Markdown persistence, preserve source text when showing comment pins, and allow only clipboard writing for explicitly requested draft copies. Refresh document context after author operations so newly created documents can be selected immediately. The separate compilation and video workspaces remain subsequent work.
- 672d5e5: Distinguish on-screen content, narration/captions and reading-only text with compact icons in the workbench's document editing view. Accessible labels follow the document language, disappear in reading and presentation views, and stay outside text saved to the source.
- 1f329f6: Bind inline preview position and playback messages to the workbench's current navigation generation. Delayed messages cannot pull another card back to an earlier step, including repeat visits to the same step. Acknowledge accepted local navigation without seeking its running clock, and re-report local input made while that acknowledgement was in transit.
- d6ac2f8: Keep title and complex-text drafts across preview reloads and document switches, and acknowledge each source edit by target and input version. Match editable source snapshots against the compiler's actual source fingerprints before using their line maps.
  
  Add page deletion with fresh source confirmation, incoming-reference checks and undoable history. Preserve remaining page identities and shared asset files, and retain an empty page after clearing the last one. Explain page movement limits in the shared menu and show document hierarchy in page navigation.
- 7ea1f91: The studio reads like an editor, and its styles take every value from the design tokens.
  
  - `@lincyaw/design`: tokens for the editor's frame (`chrome`, `canvas`, `hover`, `accent-line` and `backdrop` colours, `--pm-shadow-page`), sizes (`--pm-size-*`), the bars and panes (`--pm-appbar-height`, `--pm-toolbar-height`, `--pm-navigation-width`, `--pm-aside-width`, `--pm-sheet-width`…), `--pm-space-px`, the `tool` and `sheet` radii and the `spin` and `pulse` durations; the `navigation` icon. The unused `--pm-activity-width` and `--pm-sidebar-width` are gone.
  - `@lincyaw/dsh`: an app bar across the top (the brand, the path to the open document or panel, the AI assistant, More, Settings and Help) in place of the activity bar; hairline column handles.
  - `@lincyaw/workbench`: the document view has a command bar of flat grouped commands, a navigation pane (the sections, or the numbered slides) that goes to a section, the document on a canvas (a slide at the deck's `aspectRatio`), and a status bar with the section or slide, the word count and what the mode allows; the documents are listed as rows. `DocumentView` takes `framed` when the layout shows the title; `Workbench.goToSection` and `WorkbenchState.position`.
  - `@lincyaw/web`: in a workbench's preview the document is one page on the canvas, without the site's navigation bar, search, sidebar, outline or heading permalinks.
  - `@lincyaw/kernel`: `isPreviewEmbedded()` tells a page that a workbench embeds it.
  - `@lincyaw/addon-core`: in a workbench's preview the player's letterbox takes the canvas colour and its navigation controls are hidden.
- a9325fe: 读者、讲者看到的界面文字按界面术语与文案规范（docs/glossary.md）统一：演示者视图、观众视图、结束放映、讲稿与配音、撤消、更新（不再显示“重新编译”）、网页视图；en 的命令、窗格与视图用 Title Case，消息与字段用 sentence case，弯引号与美式拼写（Canceled）。启动报告、对话框的“关闭”、站点启动失败与审批失败的提示改为目录文本；读者问答按共享的界面语言规则（`currentLocale()`）告诉模型用哪种语言回答；Notebook 中的终端说明、手动字幕过期提示、配音试听文字按文稿的 `lang` 取自目录。
- 8788569: Reuse unchanged Markdown fragments and built-in sections during editing, merge rapid saves and cancel obsolete compilations. Preserve complete IR validation and numbering while reducing repeated traversal. Serialize host compilations and bound common native thread pools in preview, build and execution child processes so background work leaves resources for other applications.
- f46b5e8: Carry explicit inline animation step selections into the document's shared position, so formal presentation opens on the same page and stable step. Validate frame identity, runtime revision and source step ownership without writing content, scrolling the editor or adding event streams. Ignore initial widget positions.
- a2039e8: Resolve legacy `@lincyaw/slidev-addon-*` imports in document code to the renamed plugins' shared public exports. Existing lectures and scenes continue to load in previews and built sites when only the new packages are installed, without bundling duplicate plugin runtimes.
- 3f4442a: Name the classroom's and the other plugins' public API after what each name does, and move the demonstration components out of the published plugins. Old name to new name:
  
  - `@lincyaw/addon-classroom`:
    - The classroom store's records name the right options of a quiz `correct` (`QuizState`, `QuizSource` and the `PmQuiz` prop, which was `answer`), the asker of a question `participant` (was `author`) and the component a record belongs to `quizId`, `pulseId`, `predictId`, `exerciseId` (were `quiz`, `pulse`, `predict`, `exercise`). Records that earlier versions wrote are still read. A deck that writes `{component} PmQuiz` with an `answer` prop passes `correct` instead; `{quiz}` is unchanged.
    - `isAnswer`, `isQuizState`, `isPulseVote`, `isSubmission`, `isQuestion`, `isNote`, `isSavedPrediction`, `isPrediction` to `toAnswer`, `toQuizState`, `toPulseVote`, `toSubmission`, `toQuestion`, `toNote`, `toSavedPrediction`, `toPrediction` (they return the record, or `undefined`); `useCollection` takes such a function.
    - `useSession`, `useNotes`, `useWrite`, `bothStores` to `useParticipation`, `useNoteStore`, `useGuardedWrite`, `layeredStore`; `readersHave`, `isLabel`, `sectionNumbers` to `isForStudents`, `isAuthorLabel`, `toSectionNumbers`; `tally`, `distribution`, `summarize`, `summaryText`, `Tally`, `ExerciseSummary` to `quizTally`, `pulseTally`, `exerciseTally`, `exerciseTallyText`, `QuizTally`, `ExerciseTally`; `QuestionGroup.place` to `label`. New: `classroomRows`, `unansweredCount`, `ClassroomRecords`, `ClassroomRows`. No longer exported: `READERS`, `CHECK_PROGRAM`, `typicalError`.
    - The passes are named `presmium.classroom.places`, `presmium.classroom.predict-reveals` and `presmium.classroom.predict-fallbacks`.
  - `@lincyaw/addon-session`: `createClassroom`, `Classroom`, `ClassroomOptions` to `createClassroomConnection`, `ClassroomConnection`, `ClassroomConnectionOptions`, and its `serve()` to `setServer()`; `useClassroom` to `useClassroomSession`; `started`, `ended`, `cursorOf`, `plain`, `loopbackLink`, `roomId`, `sessionConfig` to `startRecord`, `endRecord`, `clonePosition`, `jsonClone`, `isLoopbackLink`, `readableString`, `toSessionConfig`. `ClassroomSnapshot.presenterPosition`, which nothing read, is removed.
  - `@lincyaw/classroom-server`: `ClassroomServerOptions.host` to `listenAddress`; the command's file is `bin/presmium-classroom-server.mjs` (the command and its `--host` are unchanged).
  - `@lincyaw/addon-publish`: `OFFLINE_MANIFEST`, `OfflineManifest` to `OFFLINE_CACHE_RULES`, `OfflineCacheRules`; `onInBuild`, `publishOptions` to `slidevEnablesInBuild`, `toPublishOptions`. New: `MEDIA_EXTENSIONS`. The pass is named `presmium.publish.remote-assets`.
  - `@lincyaw/addon-core`: the demonstration components `PmDemoStepper`, `PmDemoGreeting`, `PmDemoAnimated`, `PmDemoBroken`, the demonstration plugins (`demoPlugins`, `DEMO_GREETER`, `DEMO_GREETING`, `Greeter`), `wantsDemo`, the `presmium.core.demo` option and the `presmiumPlugins` export are removed (they live in a test plugin of the repository). `sharedOut`, `sharedReceiver`, `slideSectionOf`, `SlideSections.placeOf` to `sharedStateOut`, `createSharedStateIn`, `toSlideSection`, `SlideSections.slideAt`. The pass is named `presmium.core.slide-sections`.
  - `@lincyaw/host`: `pluginsOf(module)` takes no configuration: a plugin module no longer exports `presmiumPlugins(config)`.
  - `@lincyaw/addon-content`: `<presmium-demo-counter>`, `defineDemoElements`, `DEMO_COUNTER_TAG`, `contentPlugin` and the `./client` export are removed. The pass is named `presmium.content.plantuml`.
  - `@lincyaw/addon-code`: `found`, `notFound`, `locate`, `unitRecord`, `codeConfig` to `resolvedAt`, `unresolved`, `lineRange`, `originUnits`, `toCodeConfig`; `Candidate.print` and `Snippet.units` to `Candidate.fingerprint` and `Snippet.regions`. No longer exported: `dedent`, `isRegionMarker`.
  - `@lincyaw/addon-stage`: `STAGE_MESSAGES` to `MESSAGES`, `screenMode` to `toScreenMode`; `./client` no longer re-exports the names of `./domain`. The pass is named `presmium.stage.footnotes`. `StageViewerContext` is removed: the viewer plugin takes `ViewerPluginContext` from `@lincyaw/viewer`, as the guide and session plugins now do too.
- 7ac550a: Name the kernel's, the compiler's and the host's public API after what each name does. Old name to new name:
  
  - `@lincyaw/kernel`: `json`, `problem` and `eventStream` to `jsonResponse`, `problemResponse` and `sseResponse`; `prefixed` to `prefixedLogger`; `Role` to `ParticipantRole`; `RendererExtension` (the extension bound to a render context) to `BoundRendererExtension`; `startPreviewAgent` and `PreviewAgent` to `connectPreviewFrame` and `PreviewFrame`; `previewActive` to `isPreviewActive`; `readPreviewCommand` and `readPreviewReport` to `toPreviewCommand` and `toPreviewReport`. New: `isRenderable`, `environmentExecutor`, `propText`, `ABSOLUTE_URL`, `NON_FILE_URL`, `urlSlug`, `OFFLINE_REQUESTS`, `PreviewProblem`, and, moved from `@lincyaw/viewer`, `FollowAnchor`, `backSection` and `followedPlace`. The workspace service's wire types (`DocumentsAnswer`, `FilesAnswer`, `IrAnswer`, `ReviewSnapshot` and the others, experimental) and `DocumentSummary` are now kernel contracts. `@lincyaw/kernel/contracts` exports only types, service tokens and the preview protocol's parsers; `localeOf`, `deckLocale` and `stepStateAt` are in `@lincyaw/kernel`. No longer exported: `GIT_SAFE_CONFIG`, `HOST_OWNER`, `normalizeWhitespace`.
  - `@lincyaw/kernel/node`: `optimizeDeps` to `linkBrowserDependencies`; `preBundle` is removed. New: `isInside`, `lanAddresses`, `bracketIPv6`.
  - `@lincyaw/compiler`: `buildView` to `buildToDist` (it takes `{ to }`; build into another directory with `build`); `lineOf` to `lineContaining`; `readFrontmatter` to `parseFrontmatter`; `inside` to `isInside` in `@lincyaw/kernel/node`; `Compilation.files`, `dependencies` (`{ files, revisions }`), `runs`, `frontmatter`, `forAudience` and `audienceOf` to `sourceFiles`, `inputs` (`{ files, gitReads }`), `runStats`, `headmatter`, `audienceDocument` and `audienceCompilation`. New types: `DevOptions`, `DevServers`, `GitRead`. No longer exported: `audienceView`, `operatorPlugins`.
  - `@lincyaw/host`: `stopPresmium` to `stopHost`; `useTheme` and `Theme` to `useAppearance` and `Appearance`; `ToolbarPlace`, `useToolbarPlace` and `provideToolbarPlace` to `ToolbarPlacement`, `useToolbarPlacement` and `provideToolbarPlacement`, and `PmToolbar`'s prop `place` to `placement`. No longer exported: `startPresmium`, `stopPresmiumOnPageHide`, `StartOptions`, `createOperations`, `createStatusRegistry`, `createPresenterPanels`, `createToolbar`, `deckChannel`, `positionSlide`.
  - `@lincyaw/server`: `networkAddresses` to the kernel's `lanAddresses`; `HostDocument` to the kernel's `DocumentSummary`; `json` and `problem` are no longer re-exported.
  - `@lincyaw/mcp`: `McpDocument` to the kernel's `DocumentSummary`.
  - `@lincyaw/viewer`: `FollowAnchor`, `backSection`, `followedPlace`, `stepKeys`, `stepTrail`, `trailStep` and `StepKeys` are imported from `@lincyaw/kernel`.
  - `@lincyaw/workbench`: `PreviewView`, `WorkspaceDocument`, `RevertAnswer`, `ReviewView` and `ReviewFollowed` to `PreviewRenderer`, `DocumentSummary`, `RevertResult`, `ReviewSnapshot` and `ReviewUpdate`.
  - `@lincyaw/addon-publish`: `OFFLINE_MESSAGES` to the kernel's `OFFLINE_REQUESTS`.
- 831ad4b: Name the renderers' and the IR runtime's public API after what each name does. Old name to new name:
  
  - `@lincyaw/viewer`: `followOperations` to `syncViewerWithOperations`; `installViewerPlugin` to `tryInstallViewerPlugin`; `ViewHost` and `OverlayHost` to `PageViewOutlet` and `OverlayViewOutlet`; `getView` to `findView`. The entry is now `src/client/index.ts`, and it no longer re-exports the domain (import those names from `@lincyaw/viewer/domain`), nor `CodeView`, `MarkdownView`, `DocumentView`, `ScrollyView`, `PresentView`, `PresenterView`, `BUILTIN_ACTIONS`, `PmMath`, `PmMermaid`, `PmRoleMark`, `messages`, `VIEWER`, `SECTION_CONTEXT`, `STEP_LINE`, `sectionFrontmatter`, `getComponent`, `getNodeRenderer`, `listActions`, `listLayers`, `registerAction`, `registerLayer`, `registerNodeRenderer` and `registerView`; a viewer plugin gets the registration functions from its context as before.
  - `@lincyaw/viewer/domain`: `originParts` to `originBar`; the texts of `outputNotes` move from `ORIGIN_MESSAGES` to the new `OUTPUT_MESSAGES` (`OutputMessages`).
  - `@lincyaw/web/domain`: `formOptions` and `FormOptions` to `crossFormLinks` and `CrossFormLinks`; `webUrl`, `slideUrl`, `viewSearch` and `requested` (`Requested`) to `webPositionUrl`, `slidesPositionUrl`, `withPositionQuery` and `parsePositionQuery` (`PositionQuery`); `toPages` to `webPages`. New: `UPDATE_EVENT`, `DevUpdateEvent`, `HomeDocument`.
  - `@lincyaw/web/client`: `createViewerHost` and `ViewerHostOptions` to `createWebHostAdapter` and `WebHostAdapterOptions`; `ThemeInput.revision` to `irRevision`, and `ThemeInput.preview` is the preview's `{ active, connect }`.
  - `@lincyaw/language-server/protocol`: `SectionAt` to `SectionLocation`. `@lincyaw/language-server/domain`: `sectionAt` and `blockAt` to `findSectionAtLine` and `findBlockAtLine`; `DirectiveInfo`, `OptionInfo` and `directiveInfos` to `DirectiveHelp`, `OptionHelp` and `directiveHelps`.
  - `@lincyaw/kernel`: new `isButton`, `hasRendererExtension`, `withPublishedAssets`, `WEB_RENDERER_PACKAGE`, `isProseRun`, `htmlAsText` and `safeDecodeURIComponent`; `@lincyaw/kernel/node`: new `findInstalledPackage`.
  - `@lincyaw/render-slides` and `@lincyaw/render-notebook`: internal names only; the slides' base style is now `src/node/deck-base.css`.
- 2f6efe1: Add page renaming and peer-page movement with a pending-edit barrier, stable page identities and source-version confirmation. Expose the compiler's actual Unicode page-target capability independently of authored metadata. Preserve interrupted script composition as a recoverable draft requiring review. Keep workbench runtime and request failures readable and contribute them to the existing document diagnostics without credentials.
- aca1f46: Keep the existing presentation recompile and exit controls usable while unconfirmed canvas revisions remain hidden and inert. Confirm only the prepared revision, reject stale confirmations and hidden-frame position updates, and report preview readiness and queued diagnostics without fabricating a position.
- e3a1abf: 移除放映顶部的版本、编译与退出工具栏；底部统一控制栏提供重新编译，并将退出按钮和 Esc 交回工作台的暂停、位置同步与文档恢复流程。
- a2039e8: Show workspace-service logs in the Studio terminal and print the timestamped log file's location at startup. Record preview preparation, viewer cache and fallback choices, compilation timings, export job phases and lecture synthesis failures with document context.
- db3b832: Switching in the workbench is instant or nearly.
  
  - `@lincyaw/addon-guide`, `@lincyaw/addon-lecture`, `@lincyaw/addon-speech`, `@lincyaw/addon-motion`: their previews are restartable (`presmium.preview.restartable`, and `restartable: true` on the kernel plugins), so a page switched away from is paused and resumed instead of loaded again. The lecture recorder is hidden in a workbench's preview.
  - `@lincyaw/web`: a document's own modules count as restartable by the document's `package.json`, else the workspace's. In a workbench the presentation view is drawn as a slide on the canvas without presenting's controls; `<html>` has the `pm-in-workbench` class there. `SiteDevServer.target` gives the dev server of a path, and `warm` also warms the page.
  - `@lincyaw/kernel`: `warmDevPage` asks a dev server for a page and its entry modules; `SiteDevServer.target`; `PreviewAnswer.prepared`.
  - `@lincyaw/server`, `@lincyaw/workspace`: the site's paths go straight to their document's dev server; a slides prefetch answers once Slidev runs and its page is warmed, with `prepared`.
  - `@lincyaw/workbench`: Present (the web form's own presentation, in the same page, switched at once) beside Document and Slides; prepared slides are loaded once out of sight before a switch; the document opened last is prepared when the workbench starts.
- 4798c02: Previews open several times faster.
  
  - `@lincyaw/kernel`: two classes of children. `interactive` ones (what the author waits for) take their threads from the machine's state now (`threadBudget`, `machineState`, `spawnInteractiveNode`, `nodeResourceArgs`) at normal priority; `background` ones keep the old budget. Also `importSpecifier` and `literalGlob`, and `SiteDevServer.warm`. The preview frame's style no longer stays in static builds.
  - `@lincyaw/web`, `@lincyaw/render-slides`: the dev servers of the previews run as interactive children. A document site pre-bundles its dependencies at once: the generated theme is the scan entry, its imports are relative, and the server warms it up. `warm` starts a document's dev server ahead of its first request, while fewer than three run.
  - `@lincyaw/addon-motion`: the deck's scene files are dependency-scan entries, so GSAP, Three.js, React and the others are pre-bundled before the page loads instead of reloading it.
  - `@lincyaw/server`, `@lincyaw/web`: the proxies to the dev servers keep their connections alive.
  - `@lincyaw/workspace`: `preview?prefetch=1` prepares a document (its web dev server, or its slides) only when the machine has room (`roomToPrefetch`).
  - `@lincyaw/workbench`: when the mouse rests on a document, or the focus reaches it, the workbench has it prepared. When the author stays on a web form, its slides start in the background.
  - `@lincyaw/dsh`: the workspace service and DeepSeek Harness start as interactive processes.
- 5e71240: Organize video production into a page and asset browser, central monitor, tabbed step inspector and full-width timeline. Reuse compact dock controls, keep editors mounted across tabs, move export into a dialog and let embedded production previews use the workbench's playback controls.
- 6d9ae73: Derive, watch, validate and publish per-step media resources from the canonical parameters. Keep video, audio, poster, caption and animation step overrides aligned with their published URLs when navigating in any order.
- 5f4e718: Authorize embedded document animation playback from the first render through a request-bound parent handshake. Preserve the existing animation clock while rejecting cancelled, expired and prior-load grants, and guard animation starts and frames against late work after pause.
- ef0a065: Add a typed, version-bound seek/pause protocol for read-only document widgets. Validate the parent window and origin, document, block ownership and stable step before navigating. Initial and reload seeks can choose a step's start; ordinary explicit seeks retain completed-step behavior.
  
  Register local scene playback with the existing playback coordinator, so pausing a widget cancels pending starts and stops its current animation frame without losing time. Navigation boundaries remain transient runtime intent and never duplicate authoring or production timing.
- 01b7cee: Unify source files and document or slides previews in editor resource tabs. Open files directly, split previews only on request, and retain drafts and undo history when switching or closing preview tabs. Use the same tabs on narrow screens and show selected conversation context below the editor.
  
  Hide duplicate document-list and slide-resource links inside embedded web previews, keeping teaching tools and chapter navigation.
  
  Keep keyboard focus on the stable resource strip, support saving from focused source tabs, and collapse empty or initially unopened problem panels.
- 6ab1b41: Keep document bundle caches valid through symlinked paths, excluding temporary build inputs. Rebuilding unchanged code no longer reloads the preview and interrupts pending body edits.
- 34e51cb: 减少编译器启动时加载的无用解析模块，解除编辑模型对显示组件的循环依赖，并加快审阅接受、恢复与批量提交。devcontainer 指纹和导出归档共用定义文件范围，文稿编辑不再使仅使用镜像的环境失效。
  
  修复 WASI 编译时读取请求头文件、Jupyter 终端启动失败后的资源释放、原生 Node 中加载 Chromium，以及浏览器导出启动失败后的清理。讲授构建保留完整文稿的语音锁定记录，学生版构建后仍可离线构建完整版。
- 34e51cb: 修复保留修改时间的文件替换和编译期间编辑导致的缓存过期问题，共用完整本机文件版本标识。各文稿的离线缓存独立更新，打开另一份文稿后仍可离线访问原文稿。语言服务使用文稿安装的 Presmium 入口及随附插件。
  
  修复连续调整尺寸时旧动画构建覆盖新画面、GSAP 构建失败后残留动画，以及切换或关闭课堂连接后的文档与订阅资源释放。
- 7003f56: Allow hosted Studio images to seed a fingerprint-checked viewer cache, avoiding runtime bundling of official plugins on first preview.
  
  Only time out an inline preview's display handshake while its content viewport is visible; offscreen preloading no longer reports a paint timeout.
- a2039e8: Reuse one compiled web viewer for document and presentation views, release lecture playback when leaving the presentation, and defer early navigation until async view plugins are available.
- c403261: Showcase-theme document pages share a product homepage's surface (cool background, translucent header, wordmark), and their page buttons keep their width and scroll sideways on narrow screens. The animation gallery's documents carry category tags and descriptions, and their introductions state each catalog's rules instead of where its entries came from.
- 672d5e5: Edit narration and captions for each presentation step in the workbench, with a choice of speaking during or after its animation. Save explicit step bindings in MyST, preserve drafts and source conflicts, and use the same timing for playback and video captions. Replace author role banners with compact icons and page/step references; add direct animation step buttons and a presentation step menu. Keep the current step while preparing or refreshing narration playback.
- a2039e8: Keep one presentation entry beside the document view. Prepare configured lecture playback in the presentation and make video files through Export. Use shared overlay tokens so playback controls remain clickable, and reserve layout space for the player and captions so the whole slide fits above them.
- a953cb8: The workbench previews the lecture video.
  
  - `@lincyaw/workbench`: a Video view beside Document, Present and Slides when the document can be made into a video: the presentation played on the lecture's timeline, with its narration, captions, cues and player, in a preview page of its own (kept while switching); above it, the video file's bar (made from the current content or before, its progress; make, play, download, cancel).
  - `@lincyaw/addon-lecture`: `defaultTrack`, the lecture a video is made of (the narrated script, else the only recording); in a workbench's preview the lecture view opens it at once.
  - `@lincyaw/web`: the viewer app takes the place and the view in its address (`?view=…&section=…&step=…`) and keeps an overlay view's place there, as the site does.
- b5e9349: 嵌入工作台的放映画面准备或更新时保留父编辑字段焦点，允许 Tab 离开预览；独立观众放映继续保留焦点锁定与键盘循环。
- e5473e5: Reuse Studio's authenticated event connection for embedded live-viewer updates and classroom control. Preserve standalone SSE and the original five workspace event frame shapes; release subscriptions by preview generation and reject late parked-frame events.
- 81e7767: Reuse Radix UI controls, cmdk command search, React Arborist file trees and react-resizable-panels for the workbench's generic interactions. Reuse Harness's onboarding modal while preserving Presmium's document, source editing and preview behavior.
  
  Create workspace preview directories before resolving the dev server's filesystem allow list, and pass canonical roots to VitePress, so previews also work beneath symlinked cache paths such as macOS /var.
- fe0c8ad: Wire the workspace home and missing-page mobile menu to the shared navigation drawer. Reuse configured links, return focus on close, and close the drawer when a destination is selected.
