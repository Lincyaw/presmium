# @lincyaw/compiler

## 1.0.0-rc.9

### Patch Changes

- Updated dependencies [fcaaa81]
  - @lincyaw/kernel@1.0.0-rc.9

## 1.0.0-rc.8

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.8

## 1.0.0-rc.7

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.7

## 1.0.0-rc.6

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.6

## 1.0.0-rc.5

### Patch Changes

- Updated dependencies [e1fcfaf]
  - @lincyaw/kernel@1.0.0-rc.5

## 1.0.0-rc.4

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.4

## 1.0.0-rc.3

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.3

## 1.0.0-rc.2

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.2

## 1.0.0-rc.1

### Major Changes

- f4adb60: Use `lecture.json` as the sole authoring entry, with a versioned Presmium teaching-document schema shared by UI and agent changes. Validate stable identities, ownership, references, component parameters, production settings and native comment anchors before accepting changes.
  
  Lower typed rich text directly into derived runtime snapshots. Preserve complete reversible step states, explicit step identities, structured narration and plugin data. Old MyST entries require the one-time offline migration; they are no longer compiler inputs. Resolve structured code references through the existing anchor and Git services.

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
- 4c91448: Expose source-bound Node service assembly without running document compilation passes, so authoring audio capabilities can be resolved when scenes or compile-time plugins cannot build.
- e924bb7: Resolve document, section and step production voice settings by stable step identity, including explicit no-voice overrides. Derive minimum holds and explicit step trailing pauses from Production while retaining existing valid speech cache entries.
  
  Refuse lecture generation when declared media mixing or step pauses inside an advancing narration clip cannot be represented faithfully. Remove the old playback-track transcript editing and resynthesis routes and controls, which bypassed canonical document transactions. Captions remain available for reading and seeking; video authoring must use the versioned document model.
- 5a51d3b: Animations on the steps and on the lecture's time. The new plugin `@lincyaw/addon-motion` adds `{scene}`: a timeline of the document's `scenes/` written with GSAP, Anime.js, Motion, Three.js or Remotion, cut into steps by `:durations:`. The host gains the time in a step (`useStepTime`, driven by the page or by a lecture through `STEP_CLOCK`) and components' named actions (`useActions`), which replay the `click` of a lecture. A component node can declare `durations`, and a synthesized lecture stays on a step until its animations have played. `presmium-lecture export` draws the animations frame by frame at 30 frames a second by default, adds a WebVTT subtitle track for each language of the captions and writes them next to the video, and `--burn <language>` draws the captions on the picture. The guidance cursor glides on the step's time, so videos show it moving. Inside a slide, the slides host's `useCursor` gives that slide and its clicks, so a preview of the next slide stays settled. The renderers give a component node's `durations` to its component as the prop `durations`.
- 2f6efe1: Add page renaming and peer-page movement with a pending-edit barrier, stable page identities and source-version confirmation. Expose the compiler's actual Unicode page-target capability independently of authored metadata. Preserve interrupted script composition as a recoverable draft requiring review. Keep workbench runtime and request failures readable and contribute them to the existing document diagnostics without credentials.
- c5cbc1c: The official plugins are renamed from `@lincyaw/slidev-addon-*` to `@lincyaw/addon-*`. A headmatter or an operator plugin list that still names a plugin the old way loads the renamed package; `presmium check` says the current name once for each (an `info` of `presmium.plugins`), and the IR lists the current names.
- afda9e9: The slides no longer use Slidev. They are the viewer's own slides page: each section a slide on a canvas of a fixed size (980 wide and 16:9 unless `renderers.slides` says otherwise), drawn in the Book layout and scaled as a whole, from the same prebuilt viewer app as the web form. A section's `{hints} slides:` takes `layout` (`default`, `cover`, `center`, `full`), `class` and `zoom`.
  
  - `presmium build --to slides` takes about 2 s for a lecture; `presmium dev --to slides` and the workbench's slides preview are the viewer's page with `?form=slides` (a switch from the document to the slides in the workbench takes about 0.15 s), and an edit reaches the slide as the sections it changed.
  - The exports print that page in Chromium (`playwright-chromium`, an optional peer of `@lincyaw/render-slides`): `pdf`, `png` (a picture of each slide, or of each step) and `pptx` (a picture of each slide, its narration as the speaker notes, with `pptxgenjs`). `presmium-export` and `presmium-diff` use them; `presmium-export` no longer takes `--wait`, since the page tells when it is ready.
  - The exporters' context builds a renderer's output (`ExportContext.build`, in place of `prepare`) and carries the asker's `options`; the compiler's `exportDocument` runs an exporter, for the workspace's jobs and for the command line.
  - Removed: `@lincyaw/addon-core` (the slides' host adapter; a headmatter that still lists it compiles, with a note), every plugin's `setup/` and Slidev layers, the plugins' `vitePlugins` (a plugin's `vite.config.ts` gives the viewer app's build its Vite plugins and Vue's `isCustomElement`), `Renderer.prepare`, `RenderContext.vitePlugins`, the host's `PmStepScope`, the kernel's `servedAssets`, `prebundleDependencies`, `warmDevPage` and `linkBrowserDependencies`, the publish addon's PWA build of the slides, and the slides' themes.
  - The presenter draws on the slides (`d`, or the pen in the presentation's bar: four inks, the eraser, undo, clear) with drauu: each slide's drawing is shared between the presenter's and the audience's windows and the classroom, and kept in the document's `.presmium/drawings/` while a server serves the page (`@lincyaw/addon-stage`). Viewer plugins can put layers on each slide (`scope: 'slide'`) and controls in the presentation's bar (`scope: 'bar'`).
  - A runnable code block can be edited in place before it runs (CodeMirror 6, loaded the first time a block is edited; Mod-Enter runs), and restored, in the pages and the slides alike.
- 672d5e5: Edit narration and captions for each presentation step in the workbench, with a choice of speaking during or after its animation. Save explicit step bindings in MyST, preserve drafts and source conflicts, and use the same timing for playback and video captions. Replace author role banners with compact icons and page/step references; add direct animation step buttons and a presentation step menu. Keep the current step while preparing or refreshing narration playback.
- 32a4ef8: Preserve structured code-reference repository overrides, original Git snapshot references and region highlights keyed by stable teaching step IDs. Re-resolve region positions against the actual source on compilation, and reject conflicting line-number and region owners.
  
  Allow native comment anchors on authored code text while keeping referenced code opaque. The same validation accepts these anchors in UI and agent document transactions.
- cc2e25e: Bind voice quotes, confirmed auditions and generation jobs to compiler-owned canonical document identity and saved source fingerprints. Reject stale source/runtime combinations before scheduling and adopting clips, and share per-document generation admission across overlapping scopes, auditions and explicit tools. Cancellation preserves completed exact-request cache entries; read-only renderers remain IR/cache-only.

### Patch Changes

- 2744156: Unify document authoring around body blocks, generated content with source/preview views, and step narration. Edit a generated block's own code or MyST configuration without replacing its animation. Keep drafts across view changes and code reloads, report syntax errors and version conflicts, and retain the selected step.
  
  New animation blocks create independent source files and document references in one versioned transaction. Failed transactions restore files and the Git index; one undo removes both related changes.
- 4220e06: Validate cross-document section, block, rich-text and footnote link targets from canonical TeachingDocument JSON. Directory links resolve lecture.json; invalid target documents cannot supply anchors. Remove the old MyST parser path from runtime link validation.
- 588f751: Compile translated documents from canonical locale directories using the same TeachingDocument validator and their own project paths. Remove YAML/frontmatter translation reads and inherited source metadata. Expose a stable content digest that excludes translation bookkeeping and JSON formatting, and retain document descriptions used by published sites.
- daa26c9: Lower canonical named component states using their declared order when no migration index is present. Preserve explicit legacy implementation mappings while making new named states usable without migration-only metadata.
- 2645ab9: Use step-bound Narration in lecture.json as the only lecture script source. Remove the external Markdown script reader and its rendering and voice exceptions. Reject the retired script configuration in document metadata, host headmatter and workspace settings with an explicit diagnostic; existing matching speech caches remain usable.
- 01b7cee: Refresh Node services with each compilation's configuration and language, pass resolved Vite plugin entries to document and workspace renderers while keeping live saves consistent when contributors are removed, invalidate recordings with missing blobs, and consistently select and diagnose duplicate plugin components. Resolve dev output directories to their physical paths so renderer dependencies also load through symlinked output locations.
- 00e8829: 允许先插入尚未选图的原生图片块并正常保存、恢复；未选图编译时提供定位警告和可读回退。替换单个图片实例时改变素材绑定，保留共享原图及其他实例。
- d6ac2f8: Keep title and complex-text drafts across preview reloads and document switches, and acknowledge each source edit by target and input version. Match editable source snapshots against the compiler's actual source fingerprints before using their line maps.
  
  Add page deletion with fresh source confirmation, incoming-reference checks and undoable history. Preserve remaining page identities and shared asset files, and retain an empty page after clearing the last one. Explain page movement limits in the shared menu and show document hierarchy in page navigation.
- 0a245df: Preserve document tags and semantic extension identifiers, including footnote bindings, independently of stable authoring node identities. Derive motion scene names from their canonical implementation file so new structured scene definitions render without duplicate scene parameters.
- 15cec09: Edit step playback intent beside its canonical document script, with source-aware inheritance and compact start, minimum hold and trailing pause controls. Explicit step start timing overrides migrated narration defaults without changing shared narration settings; restoring inheritance preserves voice, cue and media settings.
  
  Keep unaccepted numeric input when a field becomes read-only. Buffer composition text until its final value is valid so an invalid final composition cannot save an intermediate number.
- 28111cb: 文档编辑器的选色菜单（格式工具条、块手柄、表格单元格与行列）只提供文稿的语义颜色，保存设计令牌值，编辑器与查看器显示一致；旧文稿中的 BlockNote 颜色名按最近的语义令牌显示，原值不改写。斜杠菜单与工具条可以插入行内公式和公式块并直接打开公式弹层。文稿内锚点链接在工作台内跳到对应页面，外部链接在新标签页安全打开。
- 51de911: Show canonical narration as step captions in presentations without requiring speech configuration or generating audio and estimated timing. Share a token-based caption surface, give loaded timed-caption players explicit display ownership, and preserve current step captions when no real cached audio is available.
- 8788569: Reuse unchanged Markdown fragments and built-in sections during editing, merge rapid saves and cancel obsolete compilations. Preserve complete IR validation and numbering while reducing repeated traversal. Serialize host compilations and bound common native thread pools in preview, build and execution child processes so background work leaves resources for other applications.
- f8606cc: Open the document preview without waiting for Slidev. Start slides when their view is selected, keep the document view reachable during startup or failure, and ignore preview answers from older document or view requests.
  
  Resolve the preview output directory to its real path before generating renderer paths, so macOS temporary-directory aliases do not break slides addon resolution.
- f459728: Persist explicit step-relative caption times against the original typed narration and actual audio/timing basis. Share validated manual caption groups and gaps between the production plan, Web playback, VTT and video burn-in. Provide a Video-only line-break timing form and compact caption.timing.set/reset actions through the existing source-bound authoring transaction. Retain stale proposals without applying them to changed scripts or media, preserve later form input, and require explicit review before rebinding old times. Keep Doc controls, audio bytes, narration, cue times and word-alignment provenance unchanged.
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
- e544bdb: Allow Markdown slide and only blocks to declare an absolute starting step and an exclusive ending step with at and until. Render changing results directly as Markdown with reversible replacement in the web presentation and Slidev, without a custom component or trace player.
  
  Reading layout renders text, figures, tables and code in document order without presentation board wrappers. A document can also have a second native Markdown entry for a separately arranged, stepped slide deck.
- 4cb9a17: Support canonical local audio MediaClips with real inspected asset identity, non-destructive trim ranges, gain and independent mute. Place clips only inside confirmed steps, mix them with exact cached speech through the shared playback/export plan, and expose source-bound AssetID inspection and plan-bound media reads. Reject unsupported video, recording, shared and remote inputs explicitly; this does not add binary import or media editing UI.
- 6d9ae73: Derive, watch, validate and publish per-step media resources from the canonical parameters. Keep video, audio, poster, caption and animation step overrides aligned with their published URLs when navigating in any order.
- 672d5e5: Use React components and host stores for assistant, classroom and session interfaces. Discover React component sources and generate React plugin projects, with matching examples and authoring guidance. Preserve named actions, classroom subscriptions and reversible step rendering through React hooks.
- 3cef1d4: Explicitly adopt one local audio asset as a stable step's whole-file narration through the shared source-bound HTTP/MCP authoring service. Preserve narration, cues and pronunciation, pin actual audio SHA in the same history transaction, and derive one real recording use per step for the existing playback clock and cache-only lecture publisher. Empty narration plays without invented captions; unsupported cue timing is refused. Collect effective recording assets through compiler watching and audience filtering. No new Studio adoption button, trimming, cross-step allocation, recognition or synthesis is introduced.
- 34e51cb: 减少编译器启动时加载的无用解析模块，解除编辑模型对显示组件的循环依赖，并加快审阅接受、恢复与批量提交。devcontainer 指纹和导出归档共用定义文件范围，文稿编辑不再使仅使用镜像的环境失效。
  
  修复 WASI 编译时读取请求头文件、Jupyter 终端启动失败后的资源释放、原生 Node 中加载 Chromium，以及浏览器导出启动失败后的清理。讲授构建保留完整文稿的语音锁定记录，学生版构建后仍可离线构建完整版。
- 34e51cb: 修复保留修改时间的文件替换和编译期间编辑导致的缓存过期问题，共用完整本机文件版本标识。各文稿的离线缓存独立更新，打开另一份文稿后仍可离线访问原文稿。语言服务使用文稿安装的 Presmium 入口及随附插件。
  
  修复连续调整尺寸时旧动画构建覆盖新画面、GSAP 构建失败后残留动画，以及切换或关闭课堂连接后的文档与订阅资源释放。
- e316ba8: Bind cached environment executors to their provider so changing a document's plugins uses the selected implementation. Resolve Node plugin exports in their declared condition order, including nested conditions, arrays and subpath patterns, while preserving component-only packages and missing-entry diagnostics.
- 34e51cb: 修复讲授重播时的画面复位、WebGPU 执行器卸载时的任务取消、符号 Git 引用变化后的自动编译、文件监听失败时的诊断，以及保存等待的取消与超时。
- 6c777cc: Add Settings → Voice Service with a write-only Volcengine API key, owner-authorized local persistence and live application to speech operations. Keep provider authentication separate from local configuration checks and retain explicit confirmation for preview and generation.
- d0e13b5: The web form no longer uses VitePress. One prebuilt viewer (the web form's runtime with the plugins' browser parts, built once for a set of plugins and kept in the user's cache) shows every page: in the workbench, in `presmium dev` and `presmium serve`, and in a built site, whose pages it renders on the server first and then hydrates. A document is data beside it: its IR, its own code as a small bundle, its search index, its published files. Our own site shell replaces VitePress's: header and navigation, chapters, the page's sections, pager, footer, search (MiniSearch over the IR, Chinese tokenized), languages, light and dark, the phone layout, the workspace's home page and a 404 page; it is drawn with the design tokens only.
  
  - A build of one lecture's web form takes about 2 s instead of about 25 s, and a workspace site copies the viewer once below `_app/` for all its documents; the bytes are the same in any checkout.
  - `presmium dev` and `presmium serve` start no VitePress process; an edit reaches the page as the sections it changed, and the viewer renders only those again.
  - Plugins declare the files their browser code loads while it runs as `assets` (`RuntimeAssets`: served below the document's site path and copied into a built site); the browser code finds them with the host's `siteBase()`. A document's IR is served and built as `ir.json`, its revision in the `Presmium-Revision` header of a dev server.
  - Removed: the `@lincyaw/web/client` VitePress theme export and the per-document VitePress projects.
- dcb6ad0: Resolve code anchors from the configured workspace in both document commands and the studio. Preserve pinned git reads and permanent links when a workspace is nested inside a repository, and correct the code guide's canonical references without rewriting existing user copies.
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
- Updated dependencies [b81637f]
- Updated dependencies [ce7b9b3]
- Updated dependencies [12a1172]
- Updated dependencies [ae6b2a0]
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
- Updated dependencies [3b284ac]
- Updated dependencies [f459728]
- Updated dependencies [302367d]
- Updated dependencies [3bd1372]
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
- Updated dependencies [5f4e718]
- Updated dependencies [ef0a065]
- Updated dependencies [3cef1d4]
- Updated dependencies [50da8b8]
- Updated dependencies [0ea1271]
- Updated dependencies [34e51cb]
- Updated dependencies [34e51cb]
- Updated dependencies [cd822fa]
- Updated dependencies [2e439f7]
- Updated dependencies [87113ae]
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
- Updated dependencies [01b7cee]
  - @lincyaw/kernel@1.0.0-rc.1
