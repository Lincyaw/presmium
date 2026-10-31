# @lincyaw/render-slides

## 1.0.0-rc.4

No changes in this release.

## 1.0.0-rc.3

No changes in this release.

## 1.0.0-rc.2

No changes in this release.

## 1.0.0-rc.1

### Major Changes

- afda9e9: The slides no longer use Slidev. They are the viewer's own slides page: each section a slide on a canvas of a fixed size (980 wide and 16:9 unless `renderers.slides` says otherwise), drawn in the Book layout and scaled as a whole, from the same prebuilt viewer app as the web form. A section's `{hints} slides:` takes `layout` (`default`, `cover`, `center`, `full`), `class` and `zoom`.
  
  - `presmium build --to slides` takes about 2 s for a lecture; `presmium dev --to slides` and the workbench's slides preview are the viewer's page with `?form=slides` (a switch from the document to the slides in the workbench takes about 0.15 s), and an edit reaches the slide as the sections it changed.
  - The exports print that page in Chromium (`playwright-chromium`, an optional peer of `@lincyaw/render-slides`): `pdf`, `png` (a picture of each slide, or of each step) and `pptx` (a picture of each slide, its narration as the speaker notes, with `pptxgenjs`). `presmium-export` and `presmium-diff` use them; `presmium-export` no longer takes `--wait`, since the page tells when it is ready.
  - The exporters' context builds a renderer's output (`ExportContext.build`, in place of `prepare`) and carries the asker's `options`; the compiler's `exportDocument` runs an exporter, for the workspace's jobs and for the command line.
  - Removed: `@lincyaw/addon-core` (the slides' host adapter; a headmatter that still lists it compiles, with a note), every plugin's `setup/` and Slidev layers, the plugins' `vitePlugins` (a plugin's `vite.config.ts` gives the viewer app's build its Vite plugins and Vue's `isCustomElement`), `Renderer.prepare`, `RenderContext.vitePlugins`, the host's `PmStepScope`, the kernel's `servedAssets`, `prebundleDependencies`, `warmDevPage` and `linkBrowserDependencies`, the publish addon's PWA build of the slides, and the slides' themes.
  - The presenter draws on the slides (`d`, or the pen in the presentation's bar: four inks, the eraser, undo, clear) with drauu: each slide's drawing is shared between the presenter's and the audience's windows and the classroom, and kept in the document's `.presmium/drawings/` while a server serves the page (`@lincyaw/addon-stage`). Viewer plugins can put layers on each slide (`scope: 'slide'`) and controls in the presentation's bar (`scope: 'bar'`).
  - A runnable code block can be edited in place before it runs (CodeMirror 6, loaded the first time a block is edited; Mod-Enter runs), and restored, in the pages and the slides alike.

### Minor Changes

- ae6b2a0: Heavy outputs are compile jobs, as in Overleaf: the author or the AI starts them, sees their progress and log, and opens, plays or downloads their files.
  
  - `@lincyaw/kernel`: `PresmiumNodePlugin.exporters` (`Exporter`, `ExportContext`, `ExportOutput`); `RenderContext.log`; the jobs' types (`OutputTarget`, `CompileJob`, `JobFile`, `JobsAnswer`) and `OutputJobs`, the hosts' interface; `forEachLine` in `@lincyaw/kernel/node`.
  - `@lincyaw/compiler`: `BuildOptions.base` and `log`; `availableRenderers` and `documentExporters`; `serveDirectory` serves files through `send` (ranges, validators, conditional requests), with `?download` attachments and `origins` (CORS).
  - `@lincyaw/render-slides`: the slides as PDF or PowerPoint (`pdf`, `pptx`), for any document with the slides form; the Slidev build's output goes to the job's log.
  - `@lincyaw/addon-lecture`: the lecture as a video (`video`), with its captions and the frames' progress; `exportVideo` reports captions with their language.
  - `@lincyaw/addon-publish`: `presmium-export --format pptx`; its tools' output can go to a log, and a signal stops them.
  - `@lincyaw/workspace`: the jobs, one at a time, their files below `/__outputs/`, a revision made once; the `jobs`, `jobs/cancel` and `jobs/events` routes; the server host's `build` runs as jobs.
  - `@lincyaw/server`, `@lincyaw/mcp`: `ServerHost.jobs`; MCP `build` starts jobs (renderers and exports, `wait`), `get_builds` lists them.
  - `@lincyaw/workbench`: the Export pane; `@lincyaw/dsh` proxies the job routes and tells the AI about them; `@lincyaw/design`: the `export`, `download`, `video`, `website` and `notebook` icons.

### Patch Changes

- abc191d: 切换幻灯片、到达块的 until 步骤或卸载组件时暂停视频和音频，避免隐藏的媒体继续播放；总览与下一页预览不自动播放。返回后保留手动控制，仅在仍启用自动播放时恢复中断的自动播放，网页阅读时仍可自行控制屏幕外的音频。宿主新增 useBlockStepRange，提供父子块显示范围的交集而不改变原有步骤偏移。
- 01b7cee: Refresh Node services with each compilation's configuration and language, pass resolved Vite plugin entries to document and workspace renderers while keeping live saves consistent when contributors are removed, invalidate recordings with missing blobs, and consistently select and diagnose duplicate plugin components. Resolve dev output directories to their physical paths so renderer dependencies also load through symlinked output locations.
- 8788569: Reuse unchanged Markdown fragments and built-in sections during editing, merge rapid saves and cancel obsolete compilations. Preserve complete IR validation and numbering while reducing repeated traversal. Serialize host compilations and bound common native thread pools in preview, build and execution child processes so background work leaves resources for other applications.
- 3544a7d: The lecture plays on its timeline even when some sentences cannot be said yet.
  
  - `@lincyaw/addon-lecture`: a synthesized lecture whose engine cannot say a sentence is still served for playing: the sentence is silent for the time it would take (`spokenDuration`), marked `Utterance.unsaid` with the reason, and its caption is shown; the player says how many sentences have no voice. Builds, exported videos and the agent's tools still need every sentence said; an export's error starts with its first reason. The player shows the server's reason instead of an HTTP status, and its caption sits above the player however tall the player is.
  - `@lincyaw/render-slides`: a slides export that fails while Vite optimizes a deck's dependencies on its first run is run once more.
  - `@lincyaw/workbench`: the video file's bar shows a progress bar while the file is made (indeterminate until the frames are counted), a failure in the danger colour with its first reason, and the log.
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
- 01b7cee: Preserve live code controls and recorded output inside prediction reveals, so teachers and students can predict an answer and then run the code to verify it in web and slides. Components can declare that their child code runs independently while execution panels keep their own controls.
- 4798c02: Previews open several times faster.
  
  - `@lincyaw/kernel`: two classes of children. `interactive` ones (what the author waits for) take their threads from the machine's state now (`threadBudget`, `machineState`, `spawnInteractiveNode`, `nodeResourceArgs`) at normal priority; `background` ones keep the old budget. Also `importSpecifier` and `literalGlob`, and `SiteDevServer.warm`. The preview frame's style no longer stays in static builds.
  - `@lincyaw/web`, `@lincyaw/render-slides`: the dev servers of the previews run as interactive children. A document site pre-bundles its dependencies at once: the generated theme is the scan entry, its imports are relative, and the server warms it up. `warm` starts a document's dev server ahead of its first request, while fewer than three run.
  - `@lincyaw/addon-motion`: the deck's scene files are dependency-scan entries, so GSAP, Three.js, React and the others are pre-bundled before the page loads instead of reloading it.
  - `@lincyaw/server`, `@lincyaw/web`: the proxies to the dev servers keep their connections alive.
  - `@lincyaw/workspace`: `preview?prefetch=1` prepares a document (its web dev server, or its slides) only when the machine has room (`roomToPrefetch`).
  - `@lincyaw/workbench`: when the mouse rests on a document, or the focus reaches it, the workbench has it prepared. When the author stays on a web form, its slides start in the background.
  - `@lincyaw/dsh`: the workspace service and DeepSeek Harness start as interactive processes.
- d0e13b5: The web form no longer uses VitePress. One prebuilt viewer (the web form's runtime with the plugins' browser parts, built once for a set of plugins and kept in the user's cache) shows every page: in the workbench, in `presmium dev` and `presmium serve`, and in a built site, whose pages it renders on the server first and then hydrates. A document is data beside it: its IR, its own code as a small bundle, its search index, its published files. Our own site shell replaces VitePress's: header and navigation, chapters, the page's sections, pager, footer, search (MiniSearch over the IR, Chinese tokenized), languages, light and dark, the phone layout, the workspace's home page and a 404 page; it is drawn with the design tokens only.
  
  - A build of one lecture's web form takes about 2 s instead of about 25 s, and a workspace site copies the viewer once below `_app/` for all its documents; the bytes are the same in any checkout.
  - `presmium dev` and `presmium serve` start no VitePress process; an edit reaches the page as the sections it changed, and the viewer renders only those again.
  - Plugins declare the files their browser code loads while it runs as `assets` (`RuntimeAssets`: served below the document's site path and copied into a built site); the browser code finds them with the host's `siteBase()`. A document's IR is served and built as `ir.json`, its revision in the `Presmium-Revision` header of a dev server.
  - Removed: the `@lincyaw/web/client` VitePress theme export and the per-document VitePress projects.
