# @lincyaw/addon-session

## 1.0.0-rc.13

### Patch Changes

- @lincyaw/classroom-server@1.0.0-rc.13

## 1.0.0-rc.12

### Patch Changes

- @lincyaw/classroom-server@1.0.0-rc.12

## 1.0.0-rc.11

### Patch Changes

- @lincyaw/classroom-server@1.0.0-rc.11

## 1.0.0-rc.10

### Patch Changes

- @lincyaw/classroom-server@1.0.0-rc.10

## 1.0.0-rc.9

### Patch Changes

- @lincyaw/classroom-server@1.0.0-rc.9

## 1.0.0-rc.8

### Patch Changes

- @lincyaw/classroom-server@1.0.0-rc.8

## 1.0.0-rc.7

### Patch Changes

- @lincyaw/classroom-server@1.0.0-rc.7

## 1.0.0-rc.6

### Patch Changes

- @lincyaw/classroom-server@1.0.0-rc.6

## 1.0.0-rc.5

### Patch Changes

- @lincyaw/classroom-server@1.0.0-rc.5

## 1.0.0-rc.4

### Patch Changes

- @lincyaw/classroom-server@1.0.0-rc.4

## 1.0.0-rc.3

### Patch Changes

- @lincyaw/classroom-server@1.0.0-rc.3

## 1.0.0-rc.2

### Patch Changes

- @lincyaw/classroom-server@1.0.0-rc.2

## 1.0.0-rc.1

### Minor Changes

- c5cbc1c: The official plugins are renamed from `@lincyaw/slidev-addon-*` to `@lincyaw/addon-*`. A headmatter or an operator plugin list that still names a plugin the old way loads the renamed package; `presmium check` says the current name once for each (an `info` of `presmium.plugins`), and the IR lists the current names.

### Patch Changes

- f85bc88: 界面文本按术语规范收尾：失败原因（保存、预览、发送给 AI、复刻音色、Jupyter、讲授工具与配音、代码引用参数、提示命令）按代码显示为 zh-CN 与 en 的目录文本，不再显示服务端或浏览器的英文原文；文稿修改的待确认说明改为按页面的简短摘要，不再显示 JSON 与标识；启动报告按插件声明的双语名称显示（`PluginManifest.name`）；视频制作的提示显示本地化的动作名；撤消与恢复的快捷键每个平台只写一种（Apple 设备 ⌘Z、⌘⇧Z，其他 Ctrl+Z、Ctrl+Y）；Jupyter 与 MCP 的凭据叫“访问令牌 / access token”；命令行的系统语言判断移入 `@lincyaw/kernel/node` 的 `systemLocale`。`AgentTool.errors` 让插件工具为它抛出的错误码提供按文稿语言的说明。
- a9325fe: 读者、讲者看到的界面文字按界面术语与文案规范（docs/glossary.md）统一：演示者视图、观众视图、结束放映、讲稿与配音、撤消、更新（不再显示“重新编译”）、网页视图；en 的命令、窗格与视图用 Title Case，消息与字段用 sentence case，弯引号与美式拼写（Canceled）。启动报告、对话框的“关闭”、站点启动失败与审批失败的提示改为目录文本；读者问答按共享的界面语言规则（`currentLocale()`）告诉模型用哪种语言回答；Notebook 中的终端说明、手动字幕过期提示、配音试听文字按文稿的 `lang` 取自目录。
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
- 01b7cee: Place plugin layers in their view or the viewport so freezing stays attached to the presentation, while classroom and playback controls remain interactive above spotlights and in full screen.
- 672d5e5: Use React components and host stores for assistant, classroom and session interfaces. Discover React component sources and generate React plugin projects, with matching examples and authoring guidance. Preserve named actions, classroom subscriptions and reversible step rendering through React hooks.
- 34e51cb: 修复保留修改时间的文件替换和编译期间编辑导致的缓存过期问题，共用完整本机文件版本标识。各文稿的离线缓存独立更新，打开另一份文稿后仍可离线访问原文稿。语言服务使用文稿安装的 Presmium 入口及随附插件。
  
  修复连续调整尺寸时旧动画构建覆盖新画面、GSAP 构建失败后残留动画，以及切换或关闭课堂连接后的文档与订阅资源释放。
- ec5afeb: 工作区服务可以放在一个路径下面：`presmium serve --public-url https://host/user/a/preview/` 时，网站、预览、导出产物与 `__presmium/` 路由都在该路径下，代理原样转发路径即可（例如 JupyterHub 的 jupyter-server-proxy）。页面的 `AppConfig.server` 给出这个前缀，`@lincyaw/host` 的服务端客户端与控制通道据此访问路由，并新增 `pluginRoutePath` 供插件拼出自己的路由；Jupyter 执行环境与课堂同步改用它。路径不同的导出不会互相复用产物。`presmium studio` 新增 `--preview-port`，并把带启动令牌的地址写进 0600 的状态文件；工作台对文稿上下文的请求改为相对地址，可在路径下工作。
- afda9e9: The slides no longer use Slidev. They are the viewer's own slides page: each section a slide on a canvas of a fixed size (980 wide and 16:9 unless `renderers.slides` says otherwise), drawn in the Book layout and scaled as a whole, from the same prebuilt viewer app as the web form. A section's `{hints} slides:` takes `layout` (`default`, `cover`, `center`, `full`), `class` and `zoom`.
  
  - `presmium build --to slides` takes about 2 s for a lecture; `presmium dev --to slides` and the workbench's slides preview are the viewer's page with `?form=slides` (a switch from the document to the slides in the workbench takes about 0.15 s), and an edit reaches the slide as the sections it changed.
  - The exports print that page in Chromium (`playwright-chromium`, an optional peer of `@lincyaw/render-slides`): `pdf`, `png` (a picture of each slide, or of each step) and `pptx` (a picture of each slide, its narration as the speaker notes, with `pptxgenjs`). `presmium-export` and `presmium-diff` use them; `presmium-export` no longer takes `--wait`, since the page tells when it is ready.
  - The exporters' context builds a renderer's output (`ExportContext.build`, in place of `prepare`) and carries the asker's `options`; the compiler's `exportDocument` runs an exporter, for the workspace's jobs and for the command line.
  - Removed: `@lincyaw/addon-core` (the slides' host adapter; a headmatter that still lists it compiles, with a note), every plugin's `setup/` and Slidev layers, the plugins' `vitePlugins` (a plugin's `vite.config.ts` gives the viewer app's build its Vite plugins and Vue's `isCustomElement`), `Renderer.prepare`, `RenderContext.vitePlugins`, the host's `PmStepScope`, the kernel's `servedAssets`, `prebundleDependencies`, `warmDevPage` and `linkBrowserDependencies`, the publish addon's PWA build of the slides, and the slides' themes.
  - The presenter draws on the slides (`d`, or the pen in the presentation's bar: four inks, the eraser, undo, clear) with drauu: each slide's drawing is shared between the presenter's and the audience's windows and the classroom, and kept in the document's `.presmium/drawings/` while a server serves the page (`@lincyaw/addon-stage`). Viewer plugins can put layers on each slide (`scope: 'slide'`) and controls in the presentation's bar (`scope: 'bar'`).
  - A runnable code block can be edited in place before it runs (CodeMirror 6, loaded the first time a block is edited; Mod-Enter runs), and restored, in the pages and the slides alike.
- d0e13b5: The web form no longer uses VitePress. One prebuilt viewer (the web form's runtime with the plugins' browser parts, built once for a set of plugins and kept in the user's cache) shows every page: in the workbench, in `presmium dev` and `presmium serve`, and in a built site, whose pages it renders on the server first and then hydrates. A document is data beside it: its IR, its own code as a small bundle, its search index, its published files. Our own site shell replaces VitePress's: header and navigation, chapters, the page's sections, pager, footer, search (MiniSearch over the IR, Chinese tokenized), languages, light and dark, the phone layout, the workspace's home page and a 404 page; it is drawn with the design tokens only.
  
  - A build of one lecture's web form takes about 2 s instead of about 25 s, and a workspace site copies the viewer once below `_app/` for all its documents; the bytes are the same in any checkout.
  - `presmium dev` and `presmium serve` start no VitePress process; an edit reaches the page as the sections it changed, and the viewer renders only those again.
  - Plugins declare the files their browser code loads while it runs as `assets` (`RuntimeAssets`: served below the document's site path and copied into a built site); the browser code finds them with the host's `siteBase()`. A document's IR is served and built as `ir.json`, its revision in the `Presmium-Revision` header of a dev server.
  - Removed: the `@lincyaw/web/client` VitePress theme export and the per-document VitePress projects.
- Updated dependencies [3f4442a]
- Updated dependencies [7ac550a]
  - @lincyaw/classroom-server@1.0.0-rc.1
