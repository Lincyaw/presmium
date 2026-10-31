# @lincyaw/viewer

## 1.0.0-rc.9

### Patch Changes

- Updated dependencies [fcaaa81]
  - @lincyaw/kernel@1.0.0-rc.9
  - @lincyaw/host@1.0.0-rc.9

## 1.0.0-rc.8

### Patch Changes

- @lincyaw/host@1.0.0-rc.8
  - @lincyaw/kernel@1.0.0-rc.8

## 1.0.0-rc.7

### Patch Changes

- @lincyaw/host@1.0.0-rc.7
  - @lincyaw/kernel@1.0.0-rc.7

## 1.0.0-rc.6

### Patch Changes

- @lincyaw/host@1.0.0-rc.6
  - @lincyaw/kernel@1.0.0-rc.6

## 1.0.0-rc.5

### Patch Changes

- Updated dependencies [e1fcfaf]
  - @lincyaw/kernel@1.0.0-rc.5
  - @lincyaw/host@1.0.0-rc.5

## 1.0.0-rc.4

### Patch Changes

- @lincyaw/host@1.0.0-rc.4
  - @lincyaw/kernel@1.0.0-rc.4

## 1.0.0-rc.3

### Patch Changes

- @lincyaw/host@1.0.0-rc.3
  - @lincyaw/kernel@1.0.0-rc.3

## 1.0.0-rc.2

### Patch Changes

- @lincyaw/host@1.0.0-rc.2
  - @lincyaw/kernel@1.0.0-rc.2

## 1.0.0-rc.1

### Major Changes

- 432a325: Resolve complete visual states and component parameters by authored Step ID, including reverse and arbitrary navigation. Expose local-step and semantic state through the host scope and scene context. Remove the viewer's per-page authoring editors; document editing and native comments now live in the workbench's single JSON editor.

### Minor Changes

- 8e0c72f: Render animations and components inside the native document editor using isolated read-only block hosts. Load visible blocks without additional event streams, match saved source and runtime snapshots, and refresh when project code changes. Preserve native text selection and editing, provide direct runtime interaction and step-linked native caption/script editing, and share compact/touch controls and preview states through the design system.
- 672d5e5: Unify the viewer, web shell, host and plugin components on React with external stores and shared React modules. Replace the Vue runtime and component sources, including generated plugin projects and examples.
  
  Add a lazy BlockNote body editor with source-preserving MyST saves and explicit narration blocks. Text pages, animation blocks and step narration share the preview protocol; narration timing and animation step navigation remain available during presentation.
- afda9e9: The slides no longer use Slidev. They are the viewer's own slides page: each section a slide on a canvas of a fixed size (980 wide and 16:9 unless `renderers.slides` says otherwise), drawn in the Book layout and scaled as a whole, from the same prebuilt viewer app as the web form. A section's `{hints} slides:` takes `layout` (`default`, `cover`, `center`, `full`), `class` and `zoom`.
  
  - `presmium build --to slides` takes about 2 s for a lecture; `presmium dev --to slides` and the workbench's slides preview are the viewer's page with `?form=slides` (a switch from the document to the slides in the workbench takes about 0.15 s), and an edit reaches the slide as the sections it changed.
  - The exports print that page in Chromium (`playwright-chromium`, an optional peer of `@lincyaw/render-slides`): `pdf`, `png` (a picture of each slide, or of each step) and `pptx` (a picture of each slide, its narration as the speaker notes, with `pptxgenjs`). `presmium-export` and `presmium-diff` use them; `presmium-export` no longer takes `--wait`, since the page tells when it is ready.
  - The exporters' context builds a renderer's output (`ExportContext.build`, in place of `prepare`) and carries the asker's `options`; the compiler's `exportDocument` runs an exporter, for the workspace's jobs and for the command line.
  - Removed: `@lincyaw/addon-core` (the slides' host adapter; a headmatter that still lists it compiles, with a note), every plugin's `setup/` and Slidev layers, the plugins' `vitePlugins` (a plugin's `vite.config.ts` gives the viewer app's build its Vite plugins and Vue's `isCustomElement`), `Renderer.prepare`, `RenderContext.vitePlugins`, the host's `PmStepScope`, the kernel's `servedAssets`, `prebundleDependencies`, `warmDevPage` and `linkBrowserDependencies`, the publish addon's PWA build of the slides, and the slides' themes.
  - The presenter draws on the slides (`d`, or the pen in the presentation's bar: four inks, the eraser, undo, clear) with drauu: each slide's drawing is shared between the presenter's and the audience's windows and the classroom, and kept in the document's `.presmium/drawings/` while a server serves the page (`@lincyaw/addon-stage`). Viewer plugins can put layers on each slide (`scope: 'slide'`) and controls in the presentation's bar (`scope: 'bar'`).
  - A runnable code block can be edited in place before it runs (CodeMirror 6, loaded the first time a block is edited; Mod-Enter runs), and restored, in the pages and the slides alike.
- 672d5e5: Edit narration and captions for each presentation step in the workbench, with a choice of speaking during or after its animation. Save explicit step bindings in MyST, preserve drafts and source conflicts, and use the same timing for playback and video captions. Replace author role banners with compact icons and page/step references; add direct animation step buttons and a presentation step menu. Keep the current step while preparing or refreshing narration playback.
- d0e13b5: The web form no longer uses VitePress. One prebuilt viewer (the web form's runtime with the plugins' browser parts, built once for a set of plugins and kept in the user's cache) shows every page: in the workbench, in `presmium dev` and `presmium serve`, and in a built site, whose pages it renders on the server first and then hydrates. A document is data beside it: its IR, its own code as a small bundle, its search index, its published files. Our own site shell replaces VitePress's: header and navigation, chapters, the page's sections, pager, footer, search (MiniSearch over the IR, Chinese tokenized), languages, light and dark, the phone layout, the workspace's home page and a 404 page; it is drawn with the design tokens only.
  
  - A build of one lecture's web form takes about 2 s instead of about 25 s, and a workspace site copies the viewer once below `_app/` for all its documents; the bytes are the same in any checkout.
  - `presmium dev` and `presmium serve` start no VitePress process; an edit reaches the page as the sections it changed, and the viewer renders only those again.
  - Plugins declare the files their browser code loads while it runs as `assets` (`RuntimeAssets`: served below the document's site path and copied into a built site); the browser code finds them with the host's `siteBase()`. A document's IR is served and built as `ir.json`, its revision in the `Presmium-Revision` header of a dev server.
  - Removed: the `@lincyaw/web/client` VitePress theme export and the per-document VitePress projects.
- 447d24d: The workbench owns its keyboard. While presenting, Space plays or pauses the lecture (and still moves to the next step when there is nothing to play); in Video Production, Space plays or pauses and the left and right arrows select the previous or next step, also while the preview has the focus (preview frames with `presmium-keys=playback` send them as the `shortcut` commands `play-pause`, `previous` and `next`). Ctrl+S (⌘S) saves at once anywhere, fields included, instead of opening the browser's Save dialog (the `save` shortcut command from the preview). A click no longer makes Space press the clicked button again: `@lincyaw/kernel` exports `keyBelongsToTarget` and `watchFocusSource`, under which text fields, editors, open menus and dialogs keep every key, a control reached with the keyboard keeps the keys it uses, and a clicked control gives Space and the arrows to the page. A viewer plugin's action now runs before the built-in action on the same key. The keys are listed as fixed rows in Settings → Keyboard Shortcuts.

### Patch Changes

- ac6ced6: The slide layout `full` gives the whole slide to its content: no chapter, title or footer (the title stays in the navigation, the outline and for assistive technology), so a scene can fill a slide and a lecture video frame. Two colour tokens give animations light and shade that hold in both appearances: `sheen` stays light and `shadow` stays dark. The presmium-animate skill adds animation by length (1, 5, 10, 30 and 60 seconds): what each second shows, how short pieces compose into films, how to make short moves look polished (anticipation, calibrated overshoot, reactions, light) and how to export and cut them, with a gallery (`gallery/lengths`) of 42 scenes, among them 24 polished atoms, four per library, each shown once with its beat sheet, and four 30- and 60-second films built from them (`gallery/films`). `references/libraries.md` gains the rules every scene follows and the pitfalls met while building them.
- 2744156: Unify document authoring around body blocks, generated content with source/preview views, and step narration. Edit a generated block's own code or MyST configuration without replacing its animation. Keep drafts across view changes and code reloads, report syntax errors and version conflicts, and retain the selected step.
  
  New animation blocks create independent source files and document references in one versioned transaction. Failed transactions restore files and the Git index; one undo removes both related changes.
- f8606cc: Reuse up to two loaded web preview windows when switching lectures. Inactive previews unmount document components, stop their runtime and control stream, and expire after two minutes. Resume refreshes the published IR without reloading JavaScript. Unsupported previews, changed runtime configurations, and plugins without an explicit restartable lifecycle fall back to reloading.
  
  Add optional preview activity commands and acknowledgements. Browser module packages must opt in with `presmium.preview.restartable` and kernel plugins with `PluginDefinition.restartable`, promising complete disposal followed by setup in the same window. Core and content opt in; other sources default to reloading.
  
  Validate unchanged IR snapshots with ETags and reuse a bounded cache of parsed workbench IR, avoiding repeated transfers and parsing while still checking the current revision on each request.
  
  Coalesce concurrent IR reads, revalidate saves that arrive during an earlier read, and memoize pure Markdown HAST within a bounded cache. Mounted components and background resources are never retained by this data cache.
- 01b7cee: Expose bounded browser execution feedback through the existing status registry: recent results, errors, final values and session resets, with section and block IDs when available. Request source and binary payloads are omitted.
- 2645ab9: Use step-bound Narration in lecture.json as the only lecture script source. Remove the external Markdown script reader and its rendering and voice exceptions. Reject the retired script configuration in document metadata, host headmatter and workspace settings with an explicit diagnostic; existing matching speech caches remain usable.
- 3c8ec5b: Preserve canonical table row and column spans, column widths, header rows and columns, cell styles and stable identities in the public viewer.
- 337a5a0: Show an explicit add menu for animation blocks and let authors choose a scene before inserting it. Opening the menu no longer inserts the first scene in the document.
  
  Move scene replacement into an explicitly labelled menu and show document titles instead of internal scene names where available.
  
  Size shared menu icons consistently, including menus rendered in portals. Preserve editor selection when saves in another section only change source positions.
- 672d5e5: Replace presentation and presenter text controls with compact semantic icons, keeping accessible labels and showing action names and shortcuts on hover or keyboard focus. Compact the position counter and bar spacing, add Shift+F to toggle full screen while preserving the stage plugin's F freeze key, and allow full screen in workbench previews. Reuse the same icon button for starting a lecture.
- abc191d: 切换幻灯片、到达块的 until 步骤或卸载组件时暂停视频和音频，避免隐藏的媒体继续播放；总览与下一页预览不自动播放。返回后保留手动控制，仅在仍启用自动播放时恢复中断的自动播放，网页阅读时仍可自行控制屏幕外的音频。宿主新增 useBlockStepRange，提供父子块显示范围的交集而不改变原有步骤偏移。
- da86b9a: Add New page to the page list and native block menu. Save pending body edits before inserting an independent, labeled page after the current one, then focus its editor after compilation. Retain source and narration, support undo and redo, and reject ambiguous source boundaries.
  
  Preserve an authored UTF-8 BOM when reading and saving source files.
- 6c00b87: 采纳五条设计规则：标题平衡换行、正文避免末行孤字（网页、幻灯片与编辑器）；嵌套圆角取外层减间隙（菜单项、Segmented 与搜索列表选项）；公共控件补齐按下态，新增骨架占位 `PmSkeleton` 用于打开文稿、页面栏与预览准备，批注侧栏为空时给出引导；成功与错误消息说明具体结果与下一步；动效只用 transform 与 opacity，令牌检查报告动画布局属性的过渡与关键帧。
- 9049893: Make document widgets directly interactive and replace the interaction switch with an accessible refresh icon, retaining loading and disabled feedback. Resolve explicit preview steps through complete semantic state and parameters while preserving reader controls.
  
  Carry discrete boundaries from the existing local animation clock into source step navigation, including the first Play on a first-page animation. Preserve playback through scene state changes and keep initial reading defaults separate from actual user navigation. Ordinary reader playback does not acquire document widget navigation behavior.
- 21b2143: Keep document authoring independent from presentation and video controls, with every chapter visible in one continuous authoring canvas. Restore ordinary BlockNote paragraph, list and formatting edits; make toolbar undo use the editor's own history before saved source revisions, retain stable page identities during native title edits, and preserve confirmed source bindings when restoring deleted simple blocks. Keep newer input explicit across delayed save acknowledgements and return completed writes only to their original preview instance. Retain drafts while a preview is inactive and do not replay request replies after a new handshake.
  
  Keep author tools within desktop and touch viewports, avoid covering selections with formatting or comment tools, expose only formatting that survives Markdown persistence, preserve source text when showing comment pins, and allow only clipboard writing for explicitly requested draft copies. Refresh document context after author operations so newly created documents can be selected immediately. The separate compilation and video workspaces remain subsequent work.
- 672d5e5: Distinguish on-screen content, narration/captions and reading-only text with compact icons in the workbench's document editing view. Accessible labels follow the document language, disappear in reading and presentation views, and stay outside text saved to the source.
- 70ffb60: Use shared accessible icon buttons for code execution controls. Add a document reading and execution view in Studio so authors can run code in the document layout without entering the slide presentation.
- d6ac2f8: Keep title and complex-text drafts across preview reloads and document switches, and acknowledge each source edit by target and input version. Match editable source snapshots against the compiler's actual source fingerprints before using their line maps.
  
  Add page deletion with fresh source confirmation, incoming-reference checks and undoable history. Preserve remaining page identities and shared asset files, and retain an empty page after clearing the last one. Explain page movement limits in the shared menu and show document hierarchy in page navigation.
- 9957f42: Render canonical columns, tabs and stacks through shared runtime components. Preserve authored column proportions, step-dependent child visibility and tab state; stack columns on narrow screens and retain every titled child in notebook output.
- 6062d4f: Fit long cover-slide body content within its available canvas instead of clipping leading paragraphs. Short covers retain their bottom alignment. Cover and regular slide checks verify every paragraph's visible bounds at desktop and mobile sizes in both appearances.
- 51de911: Show canonical narration as step captions in presentations without requiring speech configuration or generating audio and estimated timing. Share a token-based caption surface, give loaded timed-caption players explicit display ownership, and preserve current step captions when no real cached audio is available.
- f85bc88: 界面文本按术语规范收尾：失败原因（保存、预览、发送给 AI、复刻音色、Jupyter、讲授工具与配音、代码引用参数、提示命令）按代码显示为 zh-CN 与 en 的目录文本，不再显示服务端或浏览器的英文原文；文稿修改的待确认说明改为按页面的简短摘要，不再显示 JSON 与标识；启动报告按插件声明的双语名称显示（`PluginManifest.name`）；视频制作的提示显示本地化的动作名；撤消与恢复的快捷键每个平台只写一种（Apple 设备 ⌘Z、⌘⇧Z，其他 Ctrl+Z、Ctrl+Y）；Jupyter 与 MCP 的凭据叫“访问令牌 / access token”；命令行的系统语言判断移入 `@lincyaw/kernel/node` 的 `systemLocale`。`AgentTool.errors` 让插件工具为它抛出的错误码提供按文稿语言的说明。
- a9325fe: 读者、讲者看到的界面文字按界面术语与文案规范（docs/glossary.md）统一：演示者视图、观众视图、结束放映、讲稿与配音、撤消、更新（不再显示“重新编译”）、网页视图；en 的命令、窗格与视图用 Title Case，消息与字段用 sentence case，弯引号与美式拼写（Canceled）。启动报告、对话框的“关闭”、站点启动失败与审批失败的提示改为目录文本；读者问答按共享的界面语言规则（`currentLocale()`）告诉模型用哪种语言回答；Notebook 中的终端说明、手动字幕过期提示、配音试听文字按文稿的 `lang` 取自目录。
- 8788569: Reuse unchanged Markdown fragments and built-in sections during editing, merge rapid saves and cancel obsolete compilations. Preserve complete IR validation and numbering while reducing repeated traversal. Serialize host compilations and bound common native thread pools in preview, build and execution child processes so background work leaves resources for other applications.
- 5a51d3b: Animations on the steps and on the lecture's time. The new plugin `@lincyaw/addon-motion` adds `{scene}`: a timeline of the document's `scenes/` written with GSAP, Anime.js, Motion, Three.js or Remotion, cut into steps by `:durations:`. The host gains the time in a step (`useStepTime`, driven by the page or by a lecture through `STEP_CLOCK`) and components' named actions (`useActions`), which replay the `click` of a lecture. A component node can declare `durations`, and a synthesized lecture stays on a step until its animations have played. `presmium-lecture export` draws the animations frame by frame at 30 frames a second by default, adds a WebVTT subtitle track for each language of the captions and writes them next to the video, and `--burn <language>` draws the captions on the picture. The guidance cursor glides on the step's time, so videos show it moving. Inside a slide, the slides host's `useCursor` gives that slide and its clicks, so a preview of the next slide stays settled. The renderers give a component node's `durations` to its component as the prop `durations`.
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
- e544bdb: Allow Markdown slide and only blocks to declare an absolute starting step and an exclusive ending step with at and until. Render changing results directly as Markdown with reversible replacement in the web presentation and Slidev, without a custom component or trace player.
  
  Reading layout renders text, figures, tables and code in document order without presentation board wrappers. A document can also have a second native Markdown entry for a separately arranged, stepped slide deck.
- a1ebf3a: The presentation overview no longer shows each slide's number twice: the document's list styling no longer adds list markers to the overview grid.
- 2f6efe1: Add page renaming and peer-page movement with a pending-edit barrier, stable page identities and source-version confirmation. Expose the compiler's actual Unicode page-target capability independently of authored metadata. Preserve interrupted script composition as a recoverable draft requiring review. Keep workbench runtime and request failures readable and contribute them to the existing document diagnostics without credentials.
- 01b7cee: Preserve live code controls and recorded output inside prediction reveals, so teachers and students can predict an answer and then run the code to verify it in web and slides. Components can declare that their child code runs independently while execution panels keep their own controls.
- 01b7cee: Place plugin layers in their view or the viewport so freezing stays attached to the presentation, while classroom and playback controls remain interactive above spotlights and in full screen.
- 7e136ff: 修复动画在放映中缩在左上角的问题：不为所有步骤都隐藏的内容保留布局空间，居中缩放后的内容，动画使用放映可用宽度，并以变换前的布局尺寸初始化和调整场景。
- aca1f46: Keep the existing presentation recompile and exit controls usable while unconfirmed canvas revisions remain hidden and inert. Confirm only the prepared revision, reject stale confirmations and hidden-frame position updates, and report preview readiness and queued diagnostics without fabricating a position.
- e3a1abf: 移除放映顶部的版本、编译与退出工具栏；底部统一控制栏提供重新编译，并将退出按钮和 Esc 交回工作台的暂停、位置同步与文档恢复流程。
- 5e71240: Organize video production into a page and asset browser, central monitor, tabbed step inspector and full-width timeline. Reuse compact dock controls, keep editors mounted across tabs, move export into a dialog and let embedded production previews use the workbench's playback controls.
- ef0a065: Add a typed, version-bound seek/pause protocol for read-only document widgets. Validate the parent window and origin, document, block ownership and stable step before navigating. Initial and reload seeks can choose a step's start; ordinary explicit seeks retain completed-step behavior.
  
  Register local scene playback with the existing playback coordinator, so pausing a widget cancels pending starts and stops its current animation frame without losing time. Navigation boundaries remain transient runtime intent and never duplicate authoring or production timing.
- c0cc0e3: 删除放映控制栏的“跳转步骤”菜单，简化放映操作。
- 3280da6: Scroll document step navigation to the corresponding content block. Later animations below the page heading now enter the viewport and load when their steps are selected.
- 2e439f7: Keep lecture playback stable while Space is held, preserve repeated navigation without a lecture, and release preview keyboard listeners when their bridge stops.
- 7e136ff: 将步骤字幕与播放字幕统一悬浮在幻灯片画布内的底部安全区，字幕显隐不再挤压画面或改变幻灯片缩放。
- 251ba00: Slides that shrink to fit no longer flash at full size when they appear: the shrink is applied before the slide is first painted, and again before paint whenever its content changes size.
- c56b4cc: 将讲授播放、进度条与导航合并为同一横排，删除重复的页码步号，修复进度轨道缺少已播比例时不显示的问题；播放与字幕采用图标，倍速、字幕语言和只读列表移入更多菜单；移除回放控件中的音色来源徽标，保留导出来源标记。
- a2039e8: Keep one presentation entry beside the document view. Prepare configured lecture playback in the presentation and make video files through Export. Use shared overlay tokens so playback controls remain clickable, and reserve layout space for the player and captions so the whole slide fits above them.
- ae6b2a0: The workbench shows the web form in a prebuilt viewer, as a PDF viewer shows any PDF: no dev server per document.
  
  - `@lincyaw/web`: the viewer app (the web form's runtime with the workspace's plugins, built once into the user's cache and shared by every workspace) and each document's own code in a small bundle that imports Vue, Presmium's packages and the plugins' public subpaths through the app's import map. The workspace site serves them below `<base>__app/` (`SiteDevServer.app`); a document whose plugins bring Vite plugins of their own still goes to its dev server. A document's typography is our own stylesheet (`.pm-document`), the same on the site and in the viewer.
  - `@lincyaw/kernel`: `PresmiumNodePlugin.documentModules`, the virtual modules a plugin generates for each document, which the viewer takes from the document's bundle; `SiteDevServer.app`; `PREVIEW_APPEARANCE_PARAM` and `previewAppearance()`, so that a preview's first paint has the workbench's appearance.
  - `@lincyaw/addon-motion`: gives the document's scenes as a document module.
  - `@lincyaw/workspace`: `preview` answers the viewer's page once it is built (an opened document waits for it a while; a prefetch only starts it), else the dev server's.
  - `@lincyaw/workbench`: previews load with the workbench's appearance in their address.
  - `@lincyaw/viewer`: the page view's root has the `pm-document` class.
  - `@lincyaw/design`: `--pm-space-12`.
- b5e9349: 嵌入工作台的放映画面准备或更新时保留父编辑字段焦点，允许 Tab 离开预览；独立观众放映继续保留焦点锁定与键盘循环。
- 4c3abeb: Carry the complete document root through live IR updates so source identity, production settings and media assets match the published revision. Keep section updates incremental, preserve unchanged section identities, and apply optional root-field removals through ordinary JSON snapshots.
- 81e7767: Use Reka UI for shared Vue overlays, tabs and presentation focus management, Lucide for shared icons, and VueUse for theme observation. Parse reader question streams with eventsource-parser, including multiline SSE events. Keep lecture playback controls within the presentation focus scope.
- 02bbab2: Keep the complete document visible, retain body and per-step script drafts across navigation and refresh, isolate save acknowledgements and jobs to their original target, and pause/rebuild playback on arbitrary step selection. Show actionable preview preparation and connection failures.
  
  Preserve readable prose in legacy documents as protected script blocks with the original step bindings; modern body-block projects keep explicit scripts in the step panel.
  
  Read existing voiceover without generating speech implicitly. Expose a truthful optional voice catalogue and exact-request cache lookup; unsupported or unavailable provider capabilities remain explicit.
- Updated dependencies [0e2d705]
- Updated dependencies [6a2db7b]
- Updated dependencies [05448a8]
- Updated dependencies [219bf74]
- Updated dependencies [2744156]
- Updated dependencies [f8606cc]
- Updated dependencies [01b7cee]
- Updated dependencies [01b7cee]
- Updated dependencies [588f751]
- Updated dependencies [2645ab9]
- Updated dependencies [bf8efbd]
- Updated dependencies [39506bf]
- Updated dependencies [9a92214]
- Updated dependencies [55f201e]
- Updated dependencies [b81637f]
- Updated dependencies [ce7b9b3]
- Updated dependencies [12a1172]
- Updated dependencies [672d5e5]
- Updated dependencies [ae6b2a0]
- Updated dependencies [bc6c78b]
- Updated dependencies [8b0a084]
- Updated dependencies [05fa463]
- Updated dependencies [3223233]
- Updated dependencies [034204d]
- Updated dependencies [3927612]
- Updated dependencies [abc191d]
- Updated dependencies [01b7cee]
- Updated dependencies [da86b9a]
- Updated dependencies [01b7cee]
- Updated dependencies [18781ba]
- Updated dependencies [6c00b87]
- Updated dependencies [9049893]
- Updated dependencies [4634709]
- Updated dependencies [21b2143]
- Updated dependencies [672d5e5]
- Updated dependencies [e33a62f]
- Updated dependencies [00e8829]
- Updated dependencies [1f329f6]
- Updated dependencies [e924bb7]
- Updated dependencies [d6ac2f8]
- Updated dependencies [9957f42]
- Updated dependencies [0a245df]
- Updated dependencies [15cec09]
- Updated dependencies [28111cb]
- Updated dependencies [7ea1f91]
- Updated dependencies [1f0e84e]
- Updated dependencies [ba18c96]
- Updated dependencies [51de911]
- Updated dependencies [e9022ab]
- Updated dependencies [f85bc88]
- Updated dependencies [a9325fe]
- Updated dependencies [8788569]
- Updated dependencies [8e0c72f]
- Updated dependencies [637030d]
- Updated dependencies [432a325]
- Updated dependencies [70ffb60]
- Updated dependencies [3b284ac]
- Updated dependencies [f459728]
- Updated dependencies [302367d]
- Updated dependencies [3bd1372]
- Updated dependencies [41ba097]
- Updated dependencies [0cb1421]
- Updated dependencies [5a51d3b]
- Updated dependencies [3f4442a]
- Updated dependencies [7ac550a]
- Updated dependencies [425055f]
- Updated dependencies [77c1cf0]
- Updated dependencies [831ad4b]
- Updated dependencies [788ef0d]
- Updated dependencies [70cb6a2]
- Updated dependencies [6803178]
- Updated dependencies [c82e576]
- Updated dependencies [98f5d6c]
- Updated dependencies [2f6efe1]
- Updated dependencies [55f201e]
- Updated dependencies [01b7cee]
- Updated dependencies [9e1fcba]
- Updated dependencies [aca1f46]
- Updated dependencies [e3a1abf]
- Updated dependencies [01b7cee]
- Updated dependencies [db3b832]
- Updated dependencies [4798c02]
- Updated dependencies [4cb9a17]
- Updated dependencies [b4e1194]
- Updated dependencies [8008b64]
- Updated dependencies [1bdd5e1]
- Updated dependencies [e4f26da]
- Updated dependencies [4de2e16]
- Updated dependencies [6d9ae73]
- Updated dependencies [5ca5241]
- Updated dependencies [672d5e5]
- Updated dependencies [65c0a2a]
- Updated dependencies [5f4e718]
- Updated dependencies [ef0a065]
- Updated dependencies [3cef1d4]
- Updated dependencies [50da8b8]
- Updated dependencies [0ea1271]
- Updated dependencies [34e51cb]
- Updated dependencies [34e51cb]
- Updated dependencies [c9ec5f0]
- Updated dependencies [cd822fa]
- Updated dependencies [2e439f7]
- Updated dependencies [87113ae]
- Updated dependencies [ec5afeb]
- Updated dependencies [29c35c2]
- Updated dependencies [44c1a37]
- Updated dependencies [470fd59]
- Updated dependencies [6e3efc5]
- Updated dependencies [43f2efd]
- Updated dependencies [5f3f4b0]
- Updated dependencies [445390b]
- Updated dependencies [5248460]
- Updated dependencies [7e136ff]
- Updated dependencies [afda9e9]
- Updated dependencies [2d81267]
- Updated dependencies [27cdf8c]
- Updated dependencies [672d5e5]
- Updated dependencies [32a4ef8]
- Updated dependencies [f4adb60]
- Updated dependencies [01b7cee]
- Updated dependencies [0cb1421]
- Updated dependencies [3bd1372]
- Updated dependencies [3b2d1aa]
- Updated dependencies [0854838]
- Updated dependencies [ae6b2a0]
- Updated dependencies [e5473e5]
- Updated dependencies [6e3efc5]
- Updated dependencies [bc8c616]
- Updated dependencies [6c777cc]
- Updated dependencies [cc2e25e]
- Updated dependencies [d54ddce]
- Updated dependencies [81e7767]
- Updated dependencies [d0e13b5]
- Updated dependencies [02bbab2]
- Updated dependencies [c006f57]
- Updated dependencies [447d24d]
- Updated dependencies [01b7cee]
  - @lincyaw/kernel@1.0.0-rc.1
  - @lincyaw/host@1.0.0-rc.1
