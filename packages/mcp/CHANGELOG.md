# @lincyaw/mcp

## 1.0.0-rc.10

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.10
  - @lincyaw/kernel@1.0.0-rc.10
  - @lincyaw/skills@1.0.0-rc.10

## 1.0.0-rc.9

### Patch Changes

- Updated dependencies [fcaaa81]
  - @lincyaw/kernel@1.0.0-rc.9
  - @lincyaw/compiler@1.0.0-rc.9
  - @lincyaw/skills@1.0.0-rc.9

## 1.0.0-rc.8

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.8
  - @lincyaw/kernel@1.0.0-rc.8
  - @lincyaw/skills@1.0.0-rc.8

## 1.0.0-rc.7

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.7
  - @lincyaw/kernel@1.0.0-rc.7
  - @lincyaw/skills@1.0.0-rc.7

## 1.0.0-rc.6

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.6
  - @lincyaw/kernel@1.0.0-rc.6
  - @lincyaw/skills@1.0.0-rc.6

## 1.0.0-rc.5

### Patch Changes

- Updated dependencies [e1fcfaf]
  - @lincyaw/kernel@1.0.0-rc.5
  - @lincyaw/compiler@1.0.0-rc.5
  - @lincyaw/skills@1.0.0-rc.5

## 1.0.0-rc.4

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.4
  - @lincyaw/kernel@1.0.0-rc.4
  - @lincyaw/skills@1.0.0-rc.4

## 1.0.0-rc.3

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.3
  - @lincyaw/kernel@1.0.0-rc.3
  - @lincyaw/skills@1.0.0-rc.3

## 1.0.0-rc.2

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.2
  - @lincyaw/kernel@1.0.0-rc.2
  - @lincyaw/skills@1.0.0-rc.2

## 1.0.0-rc.1

### Minor Changes

- 39506bf: Read canonical authoring entities and fields through version-bound outlines and complete JSON fragments that fit the agent tool-result budget. HTTP and MCP share the same reader, source checks and permissions; the full SDK document response remains unchanged.
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
- 4634709: Expose source-bound audio capabilities, real workspace-file inspection, canonical asset inspection and workspace audio import through MCP. Reuse the Web authoring service and binary transaction, preserve agent approval and required-review boundaries, and return actual saved-file verification without compiling scenes or generating speech.
- 3bd1372: Expose canonical document read, preflight and apply over MCP through the same versioned transaction as Web. Preserve atomic text-file changes, identity, locks, rollback and history, and return saved-source verification and structured failures. Keep authoring independent of compilation and advertise unsupported stdio, required-review and retry scopes accurately.
- 0cb1421: Share workspace transcription tasks, bounded durable task discovery and typed adoption with MCP and the Studio proxy. Resolve real Node speech/audio capabilities without compiling scenes, preserve exact source bindings, inject spending confirmation and agent origin through trusted host paths, and retain the same task instance across plugin remounts. Normalize text-only transcription results into stable segments without inventing timestamps.
- 1d12f47: Share the four authoring, animation, presentation and plugin-development skills across Studio, MCP and VSIX. Add bounded skill discovery and reading without a document, plus a project installer that preserves existing skills.
- 6e3efc5: Share media-clip preflight, canonical changes and saved-source verification between Web and MCP. Read the real cache-only production plan without compiling or synthesizing, validate actual audio ranges against confirmed step duration, and apply clip additions, updates or removals through the existing source CAS, locks, history and bounded receipts. Agent changes retain trusted origin and required-review checks; removal remains available to repair references when production services or a current plan are unavailable.
- 43f2efd: Share canonical page duplication between Web and MCP. Add a source-bound semantic preflight with a compact target/count/planId/digest summary and a by-plan apply that uses the existing exact candidate, transaction and receipt owner. Read complete candidates and copied-ID mappings through optional scoped resources instead of echoing document JSON through model arguments. Preserve shared assets/definitions, opaque plugin data, original comments, authoring CAS, bounded plans/receipts, review gates and Undo history; no compilation or model request is needed.
- 445390b: Share one voiceover intent and task owner between Workspace HTTP and MCP. Add source/IR-bound status, process-local job discovery, idempotent starts, monotonic task sequence and cancellation that remains readable without compiling or loading providers. Compiled remounts borrow the Workspace owner; standalone Web servers use the same coordinator and close their own work.
  
  Expose real voice audition through an expiring quote and bounded binary audio resources instead of putting data URIs in MCP text. Track auditions during shutdown. Stop advertising the synchronous lecture_synthesize plugin tool; use the shared Workspace start_voiceover task API. The existing presmium-lecture export CLI remains unchanged.
- 6e3efc5: Share source-bound voice capabilities and real catalogue discovery between Web and MCP without waiting for scene compilation. Preserve actual engine declarations, unsupported catalogues and provider errors; reject source changes during discovery and close outstanding reads with the workspace owner. Shared speech catalogue requests retain independent borrowers and abort their provider request only when the last borrower leaves. Proxy the shared clip preflight and voice capability routes through Studio.

### Patch Changes

- 05448a8: Add bounded, source-bound browser client actions over Studio's shared connection. MCP reads actual client state, requests explicit source flush, stable step selection or existing playback controls, and reads browser acknowledgements without treating request admission as completion. Unsupported recording and draft actions stay unavailable.
- 19aeca1: Use the shared canonical document entry in agent instructions, MCP command help and recording defaults. Explain authoring document acknowledgments separately from asynchronous runtime compilation.
- bf8efbd: Share canonical page creation, rename, move and deletion rules between native Web editing and compact MCP preflight/apply actions. Preserve stable IDs, native creation Undo, versioned impact confirmation, retained narration references, scoped history and verified transaction receipts without compiling or adding a writer.
- ce7b9b3: Share canonical comment and voice authoring rules through source-bound compact MCP plans and the existing authoring transaction. Expose the trusted workspace member, preserve native editors for non-body changes, and synchronize canonical discussions before native snapshots.
- bc6c78b: Restore or discard exact component-property drafts through the existing browser request/receipt owner. Protect the author's current strict backup, fork before recovery, preserve unselected origins, and refuse pending/session-only/IME targets. Separate comment and component backup notifications while keeping legacy and foreign-owner changes observable; draft actions do not apply canonical parameters.
- 8b0a084: Explicitly inspect and read source-bound component-property drafts through the existing browser request and receipt channel. Keep passive state free of draft values, preserve latest session input after backup failure, and bound metadata and exact Unicode JSON fragments without exposing baselines or enabling draft mutation.
- 01b7cee: Publish current compilation, preview, runtime and server diagnostics through one snapshot with SSE and MCP resource subscriptions. Show concrete problems in the workbench and remove resolved or obsolete contributions without rerunning full checks when a subscriber reads the snapshot.
- 1f0e84e: Enforce schema-declared editable component parameters through the shared parameter accessor, including read-only ancestors, descendants and effective step states. Keep unknown values, allow complete public array item deletion and exact item reordering, and reject ambiguous mixed replacements. Reuse the public component-to-section lookup for editor navigation.
- e9022ab: Trim an already adopted step recording with a verified source range shared by Video, MCP, playback and export. Preserve original audio, narration and other steps, and keep whole-step captions explicitly unaligned.
- 09eb999: The command lines `presmium`, `presmium studio` (`presmium-studio`), `presmium-mcp` and `create-presmium` print their help, progress, summaries and errors in Chinese or English by the system language (`LC_ALL`, `LC_MESSAGES`, `LANG`), with the glossary's words; errors say what failed and what to do next. JSON, URLs, paths, flags and the `serve  <url>`, `workspace  <dir>`, `mcp  <url>`, `studio  <url>` lines are the same in both languages, and the English text that tests and documents quote is unchanged.
  
  MCP approval titles name the operation as a command in the document's language (“导出文稿（网站、幻灯片）” / “Export Document (Website, Slides)”), without tool names, ids or internal names; the explanations of tool error codes follow the glossary and name no tool or field, and denied approvals, pending AI changes and missing permissions have one. The VS Code extension localizes its runtime messages through `vscode.l10n` (`l10n/bundle.l10n.zh-cn.json`).
- f85bc88: 界面文本按术语规范收尾：失败原因（保存、预览、发送给 AI、复刻音色、Jupyter、讲授工具与配音、代码引用参数、提示命令）按代码显示为 zh-CN 与 en 的目录文本，不再显示服务端或浏览器的英文原文；文稿修改的待确认说明改为按页面的简短摘要，不再显示 JSON 与标识；启动报告按插件声明的双语名称显示（`PluginManifest.name`）；视频制作的提示显示本地化的动作名；撤消与恢复的快捷键每个平台只写一种（Apple 设备 ⌘Z、⌘⇧Z，其他 Ctrl+Z、Ctrl+Y）；Jupyter 与 MCP 的凭据叫“访问令牌 / access token”；命令行的系统语言判断移入 `@lincyaw/kernel/node` 的 `systemLocale`。`AgentTool.errors` 让插件工具为它抛出的错误码提供按文稿语言的说明。
- f459728: Persist explicit step-relative caption times against the original typed narration and actual audio/timing basis. Share validated manual caption groups and gaps between the production plan, Web playback, VTT and video burn-in. Provide a Video-only line-break timing form and compact caption.timing.set/reset actions through the existing source-bound authoring transaction. Retain stale proposals without applying them to changed scripts or media, preserve later form input, and require explicit review before rebinding old times. Keep Doc controls, audio bytes, narration, cue times and word-alignment provenance unchanged.
- 62b07d1: MCP 有界读取工作台的实际诊断快照，保留来源和版本；显式 check_document 运行编译与插件检查，避免仅查看问题时隐式执行。
- 3bd1372: Bind workspace builds to the acknowledged document source. Preserve task sequence, source, input fingerprint, timestamps, captions and file metadata, read a particular job without compiling, and expose document-scoped cancellation with a separate requested state.
- 41ba097: Let agents explicitly prepare the saved document preview through the active Studio client, with source-bound results, cancellation and request deadlines while preserving the current editing mode.
- 3bd1372: Subscribe to MCP tool-list changes and reconcile document-bound dsh tools at idle or before the next model step. Late plugin discovery no longer leaves a session with its initial core-only tool set; running calls retain their original client and scope.
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
- 4de2e16: Keep project title edits available for single-document and no-Git workspaces by delegating retitle plans to the existing canonical DocumentEditor CAS. Report capabilities per action, preserve exact document-token scope and review/origin checks, and omit Git snapshot fields when no real commit exists. Directory management retains its existing workspace/Git gates and transaction owner.
- 5ca5241: Add explicit, version-bound MCP inspection and paged reading of the connected author's comment drafts. Keep passive client state free of draft content, reject stale reads before durable deletion finishes, and fit complete Unicode results within the existing WebSocket and MCP budgets.
- 3cef1d4: Explicitly adopt one local audio asset as a stable step's whole-file narration through the shared source-bound HTTP/MCP authoring service. Preserve narration, cues and pronunciation, pin actual audio SHA in the same history transaction, and derive one real recording use per step for the existing playback clock and cache-only lecture publisher. Empty narration plays without invented captions; unsupported cue timing is refused. Collect effective recording assets through compiler watching and audience filtering. No new Studio adoption button, trimming, cross-step allocation, recognition or synthesis is introduced.
- 34e51cb: 修复保留修改时间的文件替换和编译期间编辑导致的缓存过期问题，共用完整本机文件版本标识。各文稿的离线缓存独立更新，打开另一份文稿后仍可离线访问原文稿。语言服务使用文稿安装的 Presmium 入口及随附插件。
  
  修复连续调整尺寸时旧动画构建覆盖新画面、GSAP 构建失败后残留动画，以及切换或关闭课堂连接后的文档与订阅资源释放。
- 44c1a37: Share scoped, bounded document history and historical file reads between Web and MCP. Require saved-source, HEAD and explicit target checks for undo, redo and per-change reverts, preserve staged and dirty files, and recover original history pagination without truncating undo-chain state. Native editor history stays independent.
- 5f3f4b0: Share source-bound project preflight and application between Web and MCP. Fix new document identities before creation or copying, confirm deletions against a bounded impact plan, preserve classified references, and reject stale trees, unsupported scope and permission/review bypasses. Reuse the existing directory transaction and failure recovery; unsafe workspace-root directory operations remain unavailable.
  
  Preserve local pinned code-reference tuples on copy and refuse directory relocation that would break their historical paths. Clarify that opaque plugin data and scene imports remain unchanged rather than being detected or rejected.
- 01b7cee: Give teaching agents observed browser feedback through get_runtime and bounded context summaries, including plugin/component failures and live execution status. Keep browser observations separate from compiled recordings. Add workspace Quick Open and a small command palette that preserve drafts, source locations and focus.
- 01b7cee: Include selected workspace code in the teacher's conversation context, with its workspace-relative path, line range, saved excerpt and selected draft text. Explicit workspace scope reuses the source editor's file checks and requires the owner role; document-relative focus and document-bound MCP tokens keep their existing behavior.
  
  Reject backslash paths consistently in source reads, saves, creation and workspace focus so Windows path normalization cannot escape the workspace.
- Updated dependencies [0e2d705]
- Updated dependencies [e6f2ba8]
- Updated dependencies [17a25b3]
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
- Updated dependencies [1d12f47]
- Updated dependencies [44c1a37]
- Updated dependencies [470fd59]
- Updated dependencies [6e3efc5]
- Updated dependencies [43f2efd]
- Updated dependencies [5f3f4b0]
- Updated dependencies [445390b]
- Updated dependencies [c403261]
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
- Updated dependencies [dcb6ad0]
- Updated dependencies [01b7cee]
  - @lincyaw/kernel@1.0.0-rc.1
  - @lincyaw/skills@1.0.0-rc.1
  - @lincyaw/compiler@1.0.0-rc.1
