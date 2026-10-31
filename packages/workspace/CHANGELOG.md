# @lincyaw/workspace

## 1.0.0-rc.8

### Patch Changes

- 6b33a28: A workspace site's presentations wear the site's theme (its tokens, fonts and stylesheets), and every page built with a workspace theme carries `data-pm-site-theme-name` on its body, so the theme's tokens reach pages that do not draw the site's shell.
- @lincyaw/compiler@1.0.0-rc.8
  - @lincyaw/kernel@1.0.0-rc.8
  - @lincyaw/server@1.0.0-rc.8

## 1.0.0-rc.7

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.7
  - @lincyaw/kernel@1.0.0-rc.7
  - @lincyaw/server@1.0.0-rc.7

## 1.0.0-rc.6

### Patch Changes

- 8defdc2: The presentations of a workspace site share one viewer app at the site's `_app/<key>/` instead of a copy per document, so a reader downloads it once for every presentation of the site (about 0.5 MB each before).
- @lincyaw/compiler@1.0.0-rc.6
  - @lincyaw/kernel@1.0.0-rc.6
  - @lincyaw/server@1.0.0-rc.6

## 1.0.0-rc.5

### Patch Changes

- 4da0afc: A workspace build tells each document's slides where its lecture is built, so the presentation no longer probes `slides/lecture/` first.
- Updated dependencies [e1fcfaf]
  - @lincyaw/kernel@1.0.0-rc.5
  - @lincyaw/compiler@1.0.0-rc.5
  - @lincyaw/server@1.0.0-rc.5

## 1.0.0-rc.4

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.4
  - @lincyaw/kernel@1.0.0-rc.4
  - @lincyaw/server@1.0.0-rc.4

## 1.0.0-rc.3

### Minor Changes

- bea12b0: A workspace build also builds the presentation and the narrated lecture of every document whose `metadata.renderers` lists `slides` or `lecture`, at `<dir>/slides/` and `<dir>/lecture/` beside its pages, with the pages and the slides linked to each other.

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.3
  - @lincyaw/kernel@1.0.0-rc.3
  - @lincyaw/server@1.0.0-rc.3

## 1.0.0-rc.2

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.2
  - @lincyaw/kernel@1.0.0-rc.2
  - @lincyaw/server@1.0.0-rc.2

## 1.0.0-rc.1

### Minor Changes

- 6a2db7b: Add source-versioned local audio imports that commit original binary files and canonical asset declarations atomically, with rollback and undo/redo. Retain a bounded canonical asset title for selection and production labels while assigning file paths independently. Inspect unused declared assets directly, then explicitly save non-destructive clip ranges, offsets, gain and mute against a confirmed production plan. Keep narration and captions unchanged, and reject unsupported media and paths.
- 39506bf: Read canonical authoring entities and fields through version-bound outlines and complete JSON fragments that fit the agent tool-result budget. HTTP and MCP share the same reader, source checks and permissions; the full SDK document response remains unchanged.
- d20d5ad: Presmium Studio 与工作区服务可以放在反向代理之后：`presmium serve --public-url <来源>` 信任该来源的主机，并用它给出预览与导出产物的地址；`presmium studio --public-url <网址> --preview-url <来源>` 把浏览器使用的根地址交给 DeepSeek Harness（`--public-url`、`--trusted-host`），把预览的来源交给工作区服务。Presmium 云端用它为每个用户运行完整的 Studio。设计系统新增 `share` 与 `stop` 图标。
- ae6b2a0: Heavy outputs are compile jobs, as in Overleaf: the author or the AI starts them, sees their progress and log, and opens, plays or downloads their files.
  
  - `@lincyaw/kernel`: `PresmiumNodePlugin.exporters` (`Exporter`, `ExportContext`, `ExportOutput`); `RenderContext.log`; the jobs' types (`OutputTarget`, `CompileJob`, `JobFile`, `JobsAnswer`) and `OutputJobs`, the hosts' interface; `forEachLine` in `@lincyaw/kernel/node`.
  - `@lincyaw/compiler`: `BuildOptions.base` and `log`; `availableRenderers` and `documentExporters`; `serveDirectory` serves files through `send` (ranges, validators, conditional requests), with `?download` attachments and `origins` (CORS).
  - `@lincyaw/render-slides`: the slides as PDF or PowerPoint (`pdf`, `pptx`), for any document with the slides form; the Slidev build's output goes to the job's log.
  - `@lincyaw/addon-lecture`: the lecture as a video (`video`), with its captions and the frames' progress; `exportVideo` reports captions with their language.
  - `@lincyaw/addon-publish`: `presmium-export --format pptx`; its tools' output can go to a log, and a signal stops them.
  - `@lincyaw/workspace`: the jobs, one at a time, their files below `/__outputs/`, a revision made once; the `jobs`, `jobs/cancel` and `jobs/events` routes; the server host's `build` runs as jobs.
  - `@lincyaw/server`, `@lincyaw/mcp`: `ServerHost.jobs`; MCP `build` starts jobs (renderers and exports, `wait`), `get_builds` lists them.
  - `@lincyaw/workbench`: the Export pane; `@lincyaw/dsh` proxies the job routes and tells the AI about them; `@lincyaw/design`: the `export`, `download`, `video`, `website` and `notebook` icons.
- 034204d: Add source-bound component base/step parameter changes, step override reset and existing Definition selection through shared pure rules and the existing authoring plans, transactions and receipts. Preserve unknown values, validate complete inherited parameters, and read large impact lists in bounded pages. HTTP authoring actions use trusted editor origin; MCP retains agent review and permissions. Independent implementation copies remain unavailable.
- 4634709: Share canonical and workspace audio inspection and imports between Web and agent hosts. Import permitted same-document workspace files through the existing atomic binary transaction with exact source, file digest and length checks, a read-only inspection receipt that supplies those file fields without inventing an asset identity, trusted history origin, required-review enforcement and saved-file verification. Retain one bounded receipt owner and close pending reads and media probes with the workspace service.
- 8e0c72f: Render animations and components inside the native document editor using isolated read-only block hosts. Load visible blocks without additional event streams, match saved source and runtime snapshots, and refresh when project code changes. Preserve native text selection and editing, provide direct runtime interaction and step-linked native caption/script editing, and share compact/touch controls and preview states through the design system.
- 637030d: Add versioned teaching-document JSON submissions with shared schema and reference validation, atomic document and project-file history, and source events independent of runtime compilation. Keep native editor drafts through delayed save receipts, offline reloads and document switches.
- 3bd1372: Expose canonical document read, preflight and apply over MCP through the same versioned transaction as Web. Preserve atomic text-file changes, identity, locks, rollback and history, and return saved-source verification and structured failures. Keep authoring independent of compilation and advertise unsupported stdio, required-review and retry scopes accurately.
- 0cb1421: Share workspace transcription tasks, bounded durable task discovery and typed adoption with MCP and the Studio proxy. Resolve real Node speech/audio capabilities without compiling scenes, preserve exact source bindings, inject spending confirmation and agent origin through trusted host paths, and retain the same task instance across plugin remounts. Normalize text-only transcription results into stable segments without inventing timestamps.
- 672d5e5: Unify the viewer, web shell, host and plugin components on React with external stores and shared React modules. Replace the Vue runtime and component sources, including generated plugin projects and examples.
  
  Add a lazy BlockNote body editor with source-preserving MyST saves and explicit narration blocks. Text pages, animation blocks and step narration share the preview protocol; narration timing and animation step navigation remain available during presentation.
- ec5afeb: 工作区服务可以放在一个路径下面：`presmium serve --public-url https://host/user/a/preview/` 时，网站、预览、导出产物与 `__presmium/` 路由都在该路径下，代理原样转发路径即可（例如 JupyterHub 的 jupyter-server-proxy）。页面的 `AppConfig.server` 给出这个前缀，`@lincyaw/host` 的服务端客户端与控制通道据此访问路由，并新增 `pluginRoutePath` 供插件拼出自己的路由；Jupyter 执行环境与课堂同步改用它。路径不同的导出不会互相复用产物。`presmium studio` 新增 `--preview-port`，并把带启动令牌的地址写进 0600 的状态文件；工作台对文稿上下文的请求改为相对地址，可在路径下工作。
- 6e3efc5: Share media-clip preflight, canonical changes and saved-source verification between Web and MCP. Read the real cache-only production plan without compiling or synthesizing, validate actual audio ranges against confirmed step duration, and apply clip additions, updates or removals through the existing source CAS, locks, history and bounded receipts. Agent changes retain trusted origin and required-review checks; removal remains available to repair references when production services or a current plan are unavailable.
- 43f2efd: Share canonical page duplication between Web and MCP. Add a source-bound semantic preflight with a compact target/count/planId/digest summary and a by-plan apply that uses the existing exact candidate, transaction and receipt owner. Read complete candidates and copied-ID mappings through optional scoped resources instead of echoing document JSON through model arguments. Preserve shared assets/definitions, opaque plugin data, original comments, authoring CAS, bounded plans/receipts, review gates and Undo history; no compilation or model request is needed.
- 445390b: Share one voiceover intent and task owner between Workspace HTTP and MCP. Add source/IR-bound status, process-local job discovery, idempotent starts, monotonic task sequence and cancellation that remains readable without compiling or loading providers. Compiled remounts borrow the Workspace owner; standalone Web servers use the same coordinator and close their own work.
  
  Expose real voice audition through an expiring quote and bounded binary audio resources instead of putting data URIs in MCP text. Track auditions during shutdown. Stop advertising the synchronous lecture_synthesize plugin tool; use the shared Workspace start_voiceover task API. The existing presmium-lecture export CLI remains unchanged.
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
- 0cb1421: Add typed transcription adoption previews and atomic narration adoption through the existing document transaction. Bind candidates, stable steps, source versions and draft revisions; require explicit pronunciation/cue and shared-narration decisions, retain adoption provenance, and preserve unrelated production settings. Reuse authoring plan IDs, CAS, rollback and history while keeping agent review enforcement separate from the trusted editor route. Adoption does not recognize audio or generate voiceover.
- 3bd1372: Add shared, source-bound audio transcription task contracts and workspace HTTP adapters. Validate canonical audio bytes before an explicitly confirmed recognition request, retain immutable candidate revisions separately from narration, and persist cancellation intents so delayed requests cannot restart them. Keep known task queries and cancellation accessible when the editable JSON is invalid. Do not adopt scripts, synthesize voiceover, or expose recording controls implicitly.
- 3b2d1aa: Add source-versioned document, page and step voice settings with explicit inheritance, stable step bindings and real service capabilities. Expose provider-owned voice catalogues and exact-text preview quotes; synthesis requires explicit confirmation of the matching quote. Keep reads cache-only, retain valid cached fragments during partial failures, and bind generation and cancellation status to the requested source revision. These services prepare the separate video workflow; they do not add voice or caption controls to document editing.
- ae6b2a0: The workbench shows the web form in a prebuilt viewer, as a PDF viewer shows any PDF: no dev server per document.
  
  - `@lincyaw/web`: the viewer app (the web form's runtime with the workspace's plugins, built once into the user's cache and shared by every workspace) and each document's own code in a small bundle that imports Vue, Presmium's packages and the plugins' public subpaths through the app's import map. The workspace site serves them below `<base>__app/` (`SiteDevServer.app`); a document whose plugins bring Vite plugins of their own still goes to its dev server. A document's typography is our own stylesheet (`.pm-document`), the same on the site and in the viewer.
  - `@lincyaw/kernel`: `PresmiumNodePlugin.documentModules`, the virtual modules a plugin generates for each document, which the viewer takes from the document's bundle; `SiteDevServer.app`; `PREVIEW_APPEARANCE_PARAM` and `previewAppearance()`, so that a preview's first paint has the workbench's appearance.
  - `@lincyaw/addon-motion`: gives the document's scenes as a document module.
  - `@lincyaw/workspace`: `preview` answers the viewer's page once it is built (an opened document waits for it a while; a prefetch only starts it), else the dev server's.
  - `@lincyaw/workbench`: previews load with the workbench's appearance in their address.
  - `@lincyaw/viewer`: the page view's root has the `pm-document` class.
  - `@lincyaw/design`: `--pm-space-12`.
- 6e3efc5: Share source-bound voice capabilities and real catalogue discovery between Web and MCP without waiting for scene compilation. Preserve actual engine declarations, unsupported catalogues and provider errors; reject source changes during discovery and close outstanding reads with the workspace owner. Shared speech catalogue requests retain independent borrowers and abort their provider request only when the last borrower leaves. Proxy the shared clip preflight and voice capability routes through Studio.
- 01b7cee: Create text files from the workbench Explorer, including missing parent directories, and open them in the shared editor while keeping the lecture preview and drafts. Existing paths, symbolic link parents, out-of-scope paths and locked documents cannot be overwritten by file creation.

### Patch Changes

- 05448a8: Add bounded, source-bound browser client actions over Studio's shared connection. MCP reads actual client state, requests explicit source flush, stable step selection or existing playback controls, and reads browser acknowledgements without treating request admission as completion. Unsupported recording and draft actions stay unavailable.
- 9445f6c: 新建文稿默认只有一页和一个空正文段落，首个页面沿用输入标题。Studio 与 CLI 按结构采用模板标题，保留自定义模板正文、引用文件和其它页面标题。
- 2744156: Unify document authoring around body blocks, generated content with source/preview views, and step narration. Edit a generated block's own code or MyST configuration without replacing its animation. Keep drafts across view changes and code reloads, report syntax errors and version conflicts, and retain the selected step.
  
  New animation blocks create independent source files and document references in one versioned transaction. Failed transactions restore files and the Git index; one undo removes both related changes.
- f8606cc: Reuse up to two loaded web preview windows when switching lectures. Inactive previews unmount document components, stop their runtime and control stream, and expire after two minutes. Resume refreshes the published IR without reloading JavaScript. Unsupported previews, changed runtime configurations, and plugins without an explicit restartable lifecycle fall back to reloading.
  
  Add optional preview activity commands and acknowledgements. Browser module packages must opt in with `presmium.preview.restartable` and kernel plugins with `PluginDefinition.restartable`, promising complete disposal followed by setup in the same window. Core and content opt in; other sources default to reloading.
  
  Validate unchanged IR snapshots with ETags and reuse a bounded cache of parsed workbench IR, avoiding repeated transfers and parsing while still checking the current revision on each request.
  
  Coalesce concurrent IR reads, revalidate saves that arrive during an earlier read, and memoize pure Markdown HAST within a bounded cache. Mounted components and background resources are never retained by this data cache.
- 2645ab9: Use step-bound Narration in lecture.json as the only lecture script source. Remove the external Markdown script reader and its rendering and voice exceptions. Reject the retired script configuration in document metadata, host headmatter and workspace settings with an explicit diagnostic; existing matching speech caches remain usable.
- bf8efbd: Share canonical page creation, rename, move and deletion rules between native Web editing and compact MCP preflight/apply actions. Preserve stable IDs, native creation Undo, versioned impact confirmation, retained narration references, scoped history and verified transaction receipts without compiling or adding a writer.
- ce7b9b3: Share canonical comment and voice authoring rules through source-bound compact MCP plans and the existing authoring transaction. Expose the trusted workspace member, preserve native editors for non-body changes, and synchronize canonical discussions before native snapshots.
- bc6c78b: Restore or discard exact component-property drafts through the existing browser request/receipt owner. Protect the author's current strict backup, fork before recovery, preserve unselected origins, and refuse pending/session-only/IME targets. Separate comment and component backup notifications while keeping legacy and foreign-owner changes observable; draft actions do not apply canonical parameters.
- 8b0a084: Explicitly inspect and read source-bound component-property drafts through the existing browser request and receipt channel. Keep passive state free of draft values, preserve latest session input after backup failure, and bound metadata and exact Unicode JSON fragments without exposing baselines or enabling draft mutation.
- 01b7cee: Refresh Node services with each compilation's configuration and language, pass resolved Vite plugin entries to document and workspace renderers while keeping live saves consistent when contributors are removed, invalidate recordings with missing blobs, and consistently select and diagnose duplicate plugin components. Resolve dev output directories to their physical paths so renderer dependencies also load through symlinked output locations.
- da86b9a: Add New page to the page list and native block menu. Save pending body edits before inserting an independent, labeled page after the current one, then focus its editor after compilation. Retain source and narration, support undo and redo, and reject ambiguous source boundaries.
  
  Preserve an authored UTF-8 BOM when reading and saving source files.
- 18bd137: 显式放映准备与新页面确认代码包对应当前工程文件；构建失败时保留正文和旧缓存，返回真实失败及文件定位，不把旧代码包作为当前已保存版本。
- 01b7cee: Publish current compilation, preview, runtime and server diagnostics through one snapshot with SSE and MCP resource subscriptions. Show concrete problems in the workbench and remove resolved or obsolete contributions without rerunning full checks when a subscriber reads the snapshot.
- dd94d7f: Resolve ordinary project files to their nearest existing document instead of treating every wildcard-matching directory as a document. Keep explicit new lecture.json entries and prospective template creation, so root documents can inspect and import their own nested media while other real documents retain their boundaries.
- e33a62f: 提供规范文稿图片导入接口：原图与素材声明原子保存并共享历史，以真实字节识别格式、尺寸和去重，拒绝过期版本及无效文件。Studio 转发同一上传接口。
- d6ac2f8: Keep title and complex-text drafts across preview reloads and document switches, and acknowledge each source edit by target and input version. Match editable source snapshots against the compiler's actual source fingerprints before using their line maps.
  
  Add page deletion with fresh source confirmation, incoming-reference checks and undoable history. Preserve remaining page identities and shared asset files, and retain an empty page after clearing the last one. Explain page movement limits in the shared menu and show document hierarchy in page navigation.
- ba18c96: Wait for the active document's acknowledged save before exporting, and bind each request and output to its exact saved source version. Preserve newer input across cancellation, document switches and late output responses. Validate source expectations on the server and include translated documents and tracked project files in output reuse and change checks.
- e9022ab: Trim an already adopted step recording with a verified source range shared by Video, MCP, playback and export. Preserve original audio, narration and other steps, and keep whole-step captions explicitly unaligned.
- 8788569: Reuse unchanged Markdown fragments and built-in sections during editing, merge rapid saves and cancel obsolete compilations. Preserve complete IR validation and numbering while reducing repeated traversal. Serialize host compilations and bound common native thread pools in preview, build and execution child processes so background work leaves resources for other applications.
- f8606cc: Open the document preview without waiting for Slidev. Start slides when their view is selected, keep the document view reachable during startup or failure, and ignore preview answers from older document or view requests.
  
  Resolve the preview output directory to its real path before generating renderer paths, so macOS temporary-directory aliases do not break slides addon resolution.
- f459728: Persist explicit step-relative caption times against the original typed narration and actual audio/timing basis. Share validated manual caption groups and gaps between the production plan, Web playback, VTT and video burn-in. Provide a Video-only line-break timing form and compact caption.timing.set/reset actions through the existing source-bound authoring transaction. Retain stale proposals without applying them to changed scripts or media, preserve later form input, and require explicit review before rebinding old times. Keep Doc controls, audio bytes, narration, cue times and word-alignment provenance unchanged.
- 41ba097: Let agents explicitly prepare the saved document preview through the active Studio client, with source-bound results, cancellation and request deadlines while preserving the current editing mode.
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
- 788ef0d: Name the server's, MCP's, the workspace's and the CLI's public API after what each name does. Old name to new name:
  
  - `@lincyaw/kernel`: new `hasRole`, `isPresentingRole`, `LOCAL_AUTHOR`, `APPROVAL_KINDS` and `pushStream` (with `PushStream`, `PushStreamOptions`), which the server, MCP, the workspace and the CLI shared as copies.
  - `@lincyaw/server`: `serverConfiguration` to `serverConfigKey`; `anyAddress` to `isAnyAddress`; `bearer` to `hasBearerToken` (whether a request carries the given bearer token); `ServerOptions.host` to `listenAddress`; `PresmiumServer.token` to `mcpToken`; the `control` of `PresmiumServer` is a `ControlChannel` whose `positions`, `go` and `setClassroom` (was `session`) take `{ document, member }`; `DiagnosticStore.revision` and `observed` to `irRevision` and `isObserved`, and the `revision` option of `DiagnosticStore.replace` to `irRevision`. No longer exported: `APPROVAL_TIMEOUT_MS`, `Control`, `WindowPosition`, `WindowReport`, `workspaceFindings`, `DiagnosticSource`, `limitBody`, `SERVER_PATH`, `LOCAL_AUTHOR` (now in `@lincyaw/kernel`).
  - `@lincyaw/mcp`: `McpHost.classroom` and `McpHost.session` to `classroomStatus` and `setClassroom`; `focusReport` to `toFocusReport`. No longer exported: `presmiumServer`, `MCP_VERSION`, `POSITION_URI`, `FOCUS_URI`, `TOOL_KIND_META`, `TOOL_APPROVAL_META`, `EXCERPT_LINES`, `excerptOf`, `McpToolInfo`; removed: `READ_TOOLS`, `OPERATE_TOOLS`, `listTools`, `TOOL_TABLE`.
  - `@lincyaw/workspace`: the `./domain` export is removed; `listDocuments`, `readWorkspace`, `FoundDocument` and `WorkspaceConfig` are no longer exported; `ServeOptions.host` to `listenAddress`. Review records written by earlier versions (with `deck`) are still read.
  - `@lincyaw/cli`: `runCheck` and its types are no longer exported from the package root; `recordingProxy` is removed from `@lincyaw/cli/testing`, and the scripted Messages model `fakeModel` moved from it to `@lincyaw/dsh/testing`.
  - `create-presmium`: internal names only (`isValidPackageName`, `packageNameFor`, `pluginIdFor`).
  
  The server's own routes (tokens, focus, diagnostics) answer 401, no longer 500, to a bearer token of the right length that differs from PRESMIUM_SERVICE_TOKEN in a non-ASCII letter.
- 6803178: Restore exact comment backups through an already mounted native reply/edit composer and acknowledge actual editor adoption after a strict fork. Explicitly discard only inactive exact backups; protect active, composing and unknown-owner targets, preserve later input, and report human recovery cancellation. New-comment composer restoration remains unavailable and no draft action submits canonical comments.
- 4e7cb7a: Display document-relative images in the native editor through BlockNote's public file URL resolver and an authenticated registered-asset route. Keep source locations unchanged through image edits and Undo, and isolate executable asset responses from the Studio origin.
- 2f6efe1: Add page renaming and peer-page movement with a pending-edit barrier, stable page identities and source-version confirmation. Expose the compiler's actual Unicode page-target capability independently of authored metadata. Preserve interrupted script composition as a recoverable draft requiring review. Keep workbench runtime and request failures readable and contribute them to the existing document diagnostics without credentials.
- 55f201e: Generate missing voiceover on explicit Studio playback, cache it through the existing revision-bound jobs, and continue in the mounted player. Preserve cancellation, stable step selection and confirmed-only time seeking/export. Show actionable speech authentication, permission, quota and network failures.
  
  Allow locally saved Volcengine access tokens with an optional matching App ID alongside API keys, without exposing credential values to clients or documents.
- 01b7cee: Keep the web preview reachable when slides are unavailable, report slides startup errors, and allow retrying after repair. Refresh available preview formats when the document's renderer configuration changes.
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
- e4f26da: Use the shared production plan and existing lecture player for the production workspace's three tracks, real audio waveforms, timed seeking and playback. Preserve canonical script edits and version ownership across compilation, preview reload and narrow-screen tabs. New documents and pages declare production capability and their authored static timing.
- 06f9ad2: Resolve files copied with a canonical document entry to that document before applying the batch, so nested source and asset directories work with multi-depth workspace patterns.
- fa52184: Refuse unsafe root-document directory operations and preserve document files, symbolic links, unrelated changes and the git index when project creation, renaming or deletion fails to commit. Bound temporary backups, distinguish expected refusals from filesystem failures, and retain protected recovery material with a typed error if filesystem rollback itself fails. Project preflight and MCP management are separate follow-up work.
- 4de2e16: Keep project title edits available for single-document and no-Git workspaces by delegating retitle plans to the existing canonical DocumentEditor CAS. Report capabilities per action, preserve exact document-token scope and review/origin checks, and omit Git snapshot fields when no real commit exists. Directory management retains its existing workspace/Git gates and transaction owner.
- 5ca5241: Add explicit, version-bound MCP inspection and paged reading of the connected author's comment drafts. Keep passive client state free of draft content, reject stale reads before durable deletion finishes, and fit complete Unicode results within the existing WebSocket and MCP budgets.
- 3cef1d4: Explicitly adopt one local audio asset as a stable step's whole-file narration through the shared source-bound HTTP/MCP authoring service. Preserve narration, cues and pronunciation, pin actual audio SHA in the same history transaction, and derive one real recording use per step for the existing playback clock and cache-only lecture publisher. Empty narration plays without invented captions; unsupported cue timing is refused. Collect effective recording assets through compiler watching and audience filtering. No new Studio adoption button, trimming, cross-step allocation, recognition or synthesis is introduced.
- 50da8b8: Remove the unregistered YAML voice-settings writer and its unused client methods and contracts. Canonical Production voice changes continue through the validated lecture.json document transaction; active voice resolution and runtime overrides remain available.
- 0b488f8: Retain existing document compilation metadata when refreshing the workspace document list. Undo and redo no longer temporarily remove an animation's document bundle from its preview.
- 34e51cb: 减少编译器启动时加载的无用解析模块，解除编辑模型对显示组件的循环依赖，并加快审阅接受、恢复与批量提交。devcontainer 指纹和导出归档共用定义文件范围，文稿编辑不再使仅使用镜像的环境失效。
  
  修复 WASI 编译时读取请求头文件、Jupyter 终端启动失败后的资源释放、原生 Node 中加载 Chromium，以及浏览器导出启动失败后的清理。讲授构建保留完整文稿的语音锁定记录，学生版构建后仍可离线构建完整版。
- 34e51cb: 修复讲授重播时的画面复位、WebGPU 执行器卸载时的任务取消、符号 Git 引用变化后的自动编译、文件监听失败时的诊断，以及保存等待的取消与超时。
- 40472dd: 源码保存等直接提交失败时恢复原 Git 索引，保留作者之前暂存的修改，避免失败的保存内容残留在暂存区。
- 594c151: 源码保存按配置中的文稿入口确定文件归属，每次事务复用一次目录发现，只读取目标文稿的语言，避免为每个工程文件重复读取整个工作区的文稿内容。
- 01b7cee: Refresh document server contributions when plugin configuration or language changes in a development session. Keep existing contributions running for body-only edits.
- 44c1a37: Share scoped, bounded document history and historical file reads between Web and MCP. Require saved-source, HEAD and explicit target checks for undo, redo and per-change reverts, preserve staged and dirty files, and recover original history pagination without truncating undo-chain state. Native editor history stays independent.
- a2039e8: Reuse one compiled web viewer for document and presentation views, release lecture playback when leaving the presentation, and defer early navigation until async view plugins are available.
- 5f3f4b0: Share source-bound project preflight and application between Web and MCP. Fix new document identities before creation or copying, confirm deletions against a bounded impact plan, preserve classified references, and reject stale trees, unsupported scope and permission/review bypasses. Reuse the existing directory transaction and failure recovery; unsafe workspace-root directory operations remain unavailable.
  
  Preserve local pinned code-reference tuples on copy and refuse directory relocation that would break their historical paths. Clarify that opaque plugin data and scene imports remain unchanged rather than being detected or rejected.
- 81e7767: Route Harness conversation file references, line references and file-tree opens to the shared source editor. Reuse existing tabs and keep unsaved changes across navigation and narrow-screen conversation switches. Preserve Harness previews for images, documents and spreadsheets.
  
  Allow the workspace owner to edit root text files through the same versioned source routes. Document pages retain their document scope.
- 0854838: 在视频制作中通过浏览器麦克风录制原音，停止后试听候选并明确保存为音频素材。录音与播放互斥，后台预览更新不会打断新录音；取消、切步、切文稿和失败回执保留已有候选并释放设备。同一原音在文稿撤消回原版本后也可再次保存，不采用失效回执。
- 6c777cc: Add Settings → Voice Service with a write-only Volcengine API key, owner-authorized local persistence and live application to speech operations. Keep provider authentication separate from local configuration checks and retain explicit confirmation for preview and generation.
- c006f57: The workbench is for teachers who know no code: they write the document in one continuous editor, and every save is a version they can undo.
  
  - `@lincyaw/workbench`:
    - Documents are listed on the home page by title, and are made from a template, renamed, copied and deleted by title. A new document opens on one blank page, ready for typing.
    - The Pages pane lists the document's pages by number and title; pages are added, copied, renamed, moved (by pointer, touch or keyboard) and deleted there.
    - The document is one editor: the author types in place and the change is saved after a short pause. Selecting text opens the formatting toolbar: styles, links, inline formulas, text and background colours from a semantic palette (the same colours in the editor and the published pages, light and dark) and Add comment. The slash menu inserts blocks such as headings, lists, tables, images and formula blocks. Formulas show typeset and are edited in a popup with a live preview.
    - Generated content (animations, components and diagrams) shows its picture, not its source; the author changes it through its properties or the AI assistant.
    - The toolbar holds the Pages pane, Undo and Redo, whether the document is saved, Video production, Captions, Comments, Version History, Presentation preview and Export. Below 768 px, Video production, Captions and Version History move into a More menu so the toolbar stays on one row.
    - Undo and Redo (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z) walk the versions, and Version History undoes any one of them. Unsaved typing survives a reload or a lost connection and is restored to the same document.
    - Comments are saved with the text they point at, across paragraphs and pages. The Comments panel lists them; each can be replied to, reacted to, resolved and reopened.
    - Presentation preview shows the slides of the saved version, with the arrow keys and `Esc` working at once; `Esc` first closes an open menu or dialog, then leaves the presentation.
    - Video production puts the page's picture, voiceover and captions on one timeline: the author edits each step's script, picks voices for the document, a page or a step, records their own voice, trims imported audio and decides whether the voice plays with the animation or after it.
    - The names follow Microsoft Word's, in Chinese and English, and every control works in light and dark, on the desktop and on a phone.
  - `@lincyaw/dsh`:
    - The app bar holds the document's path and title, Approvals (only when an outside AI tool asks to do something, which the author allows or denies), the AI assistant, More and Settings.
    - Settings offer the language, appearance, text size, keyboard shortcuts and the model; the code working view, with the AI's working details and permissions, stays off unless the author turns it on. Help names only buttons that exist.
    - The AI assistant works on the open document; without a model it says so and leads the author to set one up.
  - `@lincyaw/kernel`: the preview protocol carries the position, edits and shortcuts the editor and the preview share, and the semantic palette of document colours (`DOCUMENT_COLOR_NAMES`, `documentColorToken`, `documentColorValue`).
  - `@lincyaw/workspace`: every save in a git workspace is a version. `history/undo` and `history/redo` walk a document's versions. An AI's turn is a version too, committed when it ends, or held for the author to accept or reject when `review: required` is set.
  - `@lincyaw/design`: the icons, colour tokens and shared controls the workbench is built from, in light and dark.
- e544bdb: Browse and edit text files relative to the opened workspace, including code outside the current lecture directory. Opening a shared code file or root note keeps the lecture preview and existing drafts, and saves through the workspace's versioned source routes.
  
  Do not treat directories matching a lecture glob as actual lectures when they have no entry file. Include their code in the workspace file tree and save it as workspace files.
- 01b7cee: Include selected workspace code in the teacher's conversation context, with its workspace-relative path, line range, saved excerpt and selected draft text. Explicit workspace scope reuses the source editor's file checks and requires the owner role; document-relative focus and document-bound MCP tokens keep their existing behavior.
  
  Reject backslash paths consistently in source reads, saves, creation and workspace focus so Windows path normalization cannot escape the workspace.
- 01b7cee: Review a session's changes throughout the workspace, serialize competing writers, and preserve the review when committing fails so the author can retry or reject it.
- Updated dependencies [0e2d705]
- Updated dependencies [6a2db7b]
- Updated dependencies [05448a8]
- Updated dependencies [219bf74]
- Updated dependencies [2744156]
- Updated dependencies [f8606cc]
- Updated dependencies [01b7cee]
- Updated dependencies [01b7cee]
- Updated dependencies [4220e06]
- Updated dependencies [588f751]
- Updated dependencies [daa26c9]
- Updated dependencies [2645ab9]
- Updated dependencies [bf8efbd]
- Updated dependencies [39506bf]
- Updated dependencies [9a92214]
- Updated dependencies [b81637f]
- Updated dependencies [d20d5ad]
- Updated dependencies [ce7b9b3]
- Updated dependencies [12a1172]
- Updated dependencies [ae6b2a0]
- Updated dependencies [4c91448]
- Updated dependencies [bc6c78b]
- Updated dependencies [8b0a084]
- Updated dependencies [05fa463]
- Updated dependencies [3223233]
- Updated dependencies [034204d]
- Updated dependencies [3927612]
- Updated dependencies [01b7cee]
- Updated dependencies [da86b9a]
- Updated dependencies [01b7cee]
- Updated dependencies [18781ba]
- Updated dependencies [4634709]
- Updated dependencies [21b2143]
- Updated dependencies [672d5e5]
- Updated dependencies [e33a62f]
- Updated dependencies [00e8829]
- Updated dependencies [1f329f6]
- Updated dependencies [e924bb7]
- Updated dependencies [d6ac2f8]
- Updated dependencies [0a245df]
- Updated dependencies [15cec09]
- Updated dependencies [28111cb]
- Updated dependencies [7ea1f91]
- Updated dependencies [1f0e84e]
- Updated dependencies [ba18c96]
- Updated dependencies [51de911]
- Updated dependencies [e9022ab]
- Updated dependencies [f85bc88]
- Updated dependencies [8788569]
- Updated dependencies [8e0c72f]
- Updated dependencies [637030d]
- Updated dependencies [70ffb60]
- Updated dependencies [f8606cc]
- Updated dependencies [3b284ac]
- Updated dependencies [f459728]
- Updated dependencies [302367d]
- Updated dependencies [4634709]
- Updated dependencies [3bd1372]
- Updated dependencies [62b07d1]
- Updated dependencies [41ba097]
- Updated dependencies [0cb1421]
- Updated dependencies [5a51d3b]
- Updated dependencies [7ac550a]
- Updated dependencies [425055f]
- Updated dependencies [77c1cf0]
- Updated dependencies [831ad4b]
- Updated dependencies [788ef0d]
- Updated dependencies [6803178]
- Updated dependencies [c82e576]
- Updated dependencies [98f5d6c]
- Updated dependencies [e544bdb]
- Updated dependencies [2f6efe1]
- Updated dependencies [55f201e]
- Updated dependencies [c5cbc1c]
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
- Updated dependencies [672d5e5]
- Updated dependencies [5f4e718]
- Updated dependencies [ef0a065]
- Updated dependencies [3cef1d4]
- Updated dependencies [50da8b8]
- Updated dependencies [0ea1271]
- Updated dependencies [34e51cb]
- Updated dependencies [34e51cb]
- Updated dependencies [e316ba8]
- Updated dependencies [cd822fa]
- Updated dependencies [2e439f7]
- Updated dependencies [34e51cb]
- Updated dependencies [87113ae]
- Updated dependencies [1953b39]
- Updated dependencies [ec5afeb]
- Updated dependencies [01b7cee]
- Updated dependencies [01b7cee]
- Updated dependencies [44c1a37]
- Updated dependencies [470fd59]
- Updated dependencies [6e3efc5]
- Updated dependencies [43f2efd]
- Updated dependencies [5f3f4b0]
- Updated dependencies [445390b]
- Updated dependencies [5248460]
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
- Updated dependencies [d0e13b5]
- Updated dependencies [02bbab2]
- Updated dependencies [c006f57]
- Updated dependencies [447d24d]
- Updated dependencies [dcb6ad0]
- Updated dependencies [01b7cee]
  - @lincyaw/kernel@1.0.0-rc.1
  - @lincyaw/server@1.0.0-rc.1
  - @lincyaw/compiler@1.0.0-rc.1
