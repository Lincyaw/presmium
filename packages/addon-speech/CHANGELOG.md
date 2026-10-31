# @lincyaw/addon-speech

## 1.0.0-rc.10

No changes in this release.

## 1.0.0-rc.9

No changes in this release.

## 1.0.0-rc.8

No changes in this release.

## 1.0.0-rc.7

No changes in this release.

## 1.0.0-rc.6

No changes in this release.

## 1.0.0-rc.5

No changes in this release.

## 1.0.0-rc.4

### Patch Changes

- Released again: 1.0.0-rc.3 of `@lincyaw/addon-speech` did not reach the registry, so `@lincyaw/presmium` 1.0.0-rc.3 cannot be installed. No change in behavior.

## 1.0.0-rc.3

No changes in this release.

## 1.0.0-rc.2

No changes in this release.

## 1.0.0-rc.1

### Minor Changes

- c5cbc1c: The official plugins are renamed from `@lincyaw/slidev-addon-*` to `@lincyaw/addon-*`. A headmatter or an operator plugin list that still names a plugin the old way loads the renamed package; `presmium check` says the current name once for each (an `info` of `presmium.plugins`), and the IR lists the current names.
- 5a51d3b: An operator can define an engine that only synthesizes or only transcribes: `PRESMIUM_SPEECH_<ID>_MODEL=none` or `PRESMIUM_SPEECH_<ID>_TRANSCRIBE_MODEL=none`. The engine list reports it (`tts`, `stt`), synthesis and transcription without a named engine go to an engine that does them, and naming an engine for what it does not do is an error that names the variable. When a document's transcription engine is missing or cannot transcribe, the lecture says which setting names it. The lecture's confirmations no longer say a service charges for the work when the engine runs on this machine.
- d54ddce: Volcengine speech synthesis 2.0 (`seed-tts-2.0`) with all of its voices, and cloned voices trained from the workbench.
  
  - The Volcengine engine bundles the full 2.0 voice list. With the account's IAM access key pair (`PRESMIUM_SPEECH_VOLCENGINE_ACCESS_KEY_ID`, `PRESMIUM_SPEECH_VOLCENGINE_SECRET_ACCESS_KEY`, optional `PRESMIUM_SPEECH_VOLCENGINE_PROJECT`) the list and the account's cloned voices come from the account through Volcengine's official SDK; the keys are passed to it explicitly and reach no other address.
  - Cloned voices synthesize on 2.0 (`seed-icl-2.0`), and a busy account answers 429 rather than a failure.
  - `SpeechService.cloneVoice` and `cloneStatus`, the owner routes `clone` and `clone/status`, and `presmium-speech clone`: the speaker's consent, with the recording of the statement, is registered in the operator directory before the sample is sent. Cloned voices still need `settings.presmium.speech.cloned: true`.
  - The workbench's voice dialog has **Clone a voice…**: record or choose the consent statement and a sample (converted to WAV in the browser), confirm the cost, follow the training, and use the voice.
- 02bbab2: Keep the complete document visible, retain body and per-step script drafts across navigation and refresh, isolate save acknowledgements and jobs to their original target, and pause/rebuild playback on arbitrary step selection. Show actionable preview preparation and connection failures.
  
  Preserve readable prose in legacy documents as protected script blocks with the original step bindings; modern body-block projects keep explicit scripts in the step panel.
  
  Read existing voiceover without generating speech implicitly. Expose a truthful optional voice catalogue and exact-request cache lookup; unsupported or unavailable provider capabilities remain explicit.

### Patch Changes

- f85bc88: 界面文本按术语规范收尾：失败原因（保存、预览、发送给 AI、复刻音色、Jupyter、讲授工具与配音、代码引用参数、提示命令）按代码显示为 zh-CN 与 en 的目录文本，不再显示服务端或浏览器的英文原文；文稿修改的待确认说明改为按页面的简短摘要，不再显示 JSON 与标识；启动报告按插件声明的双语名称显示（`PluginManifest.name`）；视频制作的提示显示本地化的动作名；撤消与恢复的快捷键每个平台只写一种（Apple 设备 ⌘Z、⌘⇧Z，其他 Ctrl+Z、Ctrl+Y）；Jupyter 与 MCP 的凭据叫“访问令牌 / access token”；命令行的系统语言判断移入 `@lincyaw/kernel/node` 的 `systemLocale`。`AgentTool.errors` 让插件工具为它抛出的错误码提供按文稿语言的说明。
- a9325fe: 读者、讲者看到的界面文字按界面术语与文案规范（docs/glossary.md）统一：演示者视图、观众视图、结束放映、讲稿与配音、撤消、更新（不再显示“重新编译”）、网页视图；en 的命令、窗格与视图用 Title Case，消息与字段用 sentence case，弯引号与美式拼写（Canceled）。启动报告、对话框的“关闭”、站点启动失败与审批失败的提示改为目录文本；读者问答按共享的界面语言规则（`currentLocale()`）告诉模型用哪种语言回答；Notebook 中的终端说明、手动字幕过期提示、配音试听文字按文稿的 `lang` 取自目录。
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
- 77c1cf0: Name the lecture, speech, assistant and guide plugins' public API after what each name does, and keep the synthesis cache's layout behind the speech service. Old name to new name:
  
  - `@lincyaw/kernel`: `Synthesis` has `provider`; `SpeechService` may give `alignWords(key, { lang, transcribe? })` (the words of a cached clip, timed by transcribing it once) and `pruneLock(keep)` (keeps only these keys in `speech.lock.json`); the Node speech service gives both. New: `speechEngineId` (the rule that compares engine ids), `AigcLabel`, `aigcLabel`, `aigcString` and `isCjk`.
  - `@lincyaw/host`: new `codeLinesBox`.
  - `@lincyaw/addon-speech/domain`: `speak` and `SpokenText` to `applyLexiconWithSpans` and `LexiconText`; `SpeechBody`, `TimedSpeech`, `TranscriptionAnswer`, `EngineListing` and `VoiceListing` to `SynthesisRequestBody`, `SynthesisResponseBody`, `TranscriptionResponseBody`, `EnginesResponseBody` and `VoicesResponseBody`; `speechBody` to `synthesisRequestBody`; `synthesisRequestOf` to `toSynthesisRequest`; `engineId`, `aigcLabel`, `aigcString` and `AigcLabel` to the kernel's `speechEngineId`, `aigcLabel`, `aigcString` and `AigcLabel`. No longer exported: `fakeWords`.
  - `@lincyaw/addon-lecture/domain`: `deckTrack` and `recordedSections` to `trimToDeck` and `dropChangedSections`; `chapters` and `Chapter` to `trackChapters` and `TrackChapter`; `readCue` to `parseCue`; `narrationPlace` and `NarrationPlace` to `narrationSource` and `NarrationSource`; `ScriptSections` to `ScriptFileSections`; `PlanProblem.compiled` to `reportedAtCompile`; `PlannedSection.from` `'script'` to `'scriptFile'` (also in the `lecture_preview` tool's answer); `isCjk` to the kernel's `isCjk`. `captionsVtt`, `isStale` and `translationItems` no longer take a digest function (`Digest` is gone; `translationDigest` is the one digest). New: `isWide`, `audioSegments`, `AudioSegment`, `utteranceLine`, `LECTURE_RENDERER`, `PLAYER_RENDERER`.
  - `@lincyaw/addon-assistant/domain`: `askSettingsOf` to `toAskSettings`; `askUrlValid` to `isAskUrlValid`; `chunkText` to `streamDelta`, which takes the event's data and returns `{ done: true }` or `{ text? }` (`StreamDelta`). New: `promptLanguage`. No longer exported: `citationsOf`.
  - `@lincyaw/addon-guide`: `CUE_MESSAGES` and `CueMessages` to `GUIDE_MESSAGES` and `GuideMessages`; `LIVE_PROBE`, `LiveProbe` and `useIsLive` to `STAGE_PROBE`, `StageProbe` and `useIsOnStage`; the `CueLook` value `'live'` to `'stage'`, and so the `data-look`, `data-pm-spotlight` and `data-pm-hint` attributes of a cue drawn on the stage.
  
  Fixed: the lecture plugin compares engine ids by the speech plugin's rule, so a deck that names its engine in another spelling (for example `My.Fake` for `my_fake`) finds it; before, `presmium check` then synthesized the lecture's paragraphs through the engine. The player's "not yet synthesized" message is gone, as no route answers it.
- db3b832: Switching in the workbench is instant or nearly.
  
  - `@lincyaw/addon-guide`, `@lincyaw/addon-lecture`, `@lincyaw/addon-speech`, `@lincyaw/addon-motion`: their previews are restartable (`presmium.preview.restartable`, and `restartable: true` on the kernel plugins), so a page switched away from is paused and resumed instead of loaded again. The lecture recorder is hidden in a workbench's preview.
  - `@lincyaw/web`: a document's own modules count as restartable by the document's `package.json`, else the workspace's. In a workbench the presentation view is drawn as a slide on the canvas without presenting's controls; `<html>` has the `pm-in-workbench` class there. `SiteDevServer.target` gives the dev server of a path, and `warm` also warms the page.
  - `@lincyaw/kernel`: `warmDevPage` asks a dev server for a page and its entry modules; `SiteDevServer.target`; `PreviewAnswer.prepared`.
  - `@lincyaw/server`, `@lincyaw/workspace`: the site's paths go straight to their document's dev server; a slides prefetch answers once Slidev runs and its page is warmed, with `prepared`.
  - `@lincyaw/workbench`: Present (the web form's own presentation, in the same page, switched at once) beside Document and Slides; prepared slides are loaded once out of sight before a switch; the document opened last is prepared when the workbench starts.
- 672d5e5: Unify the viewer, web shell, host and plugin components on React with external stores and shared React modules. Replace the Vue runtime and component sources, including generated plugin projects and examples.
  
  Add a lazy BlockNote body editor with source-preserving MyST saves and explicit narration blocks. Text pages, animation blocks and step narration share the preview protocol; narration timing and animation step navigation remain available during presentation.
- 34e51cb: 修复保留修改时间的文件替换和编译期间编辑导致的缓存过期问题，共用完整本机文件版本标识。各文稿的离线缓存独立更新，打开另一份文稿后仍可离线访问原文稿。语言服务使用文稿安装的 Presmium 入口及随附插件。
  
  修复连续调整尺寸时旧动画构建覆盖新画面、GSAP 构建失败后残留动画，以及切换或关闭课堂连接后的文档与订阅资源释放。
- afda9e9: The slides no longer use Slidev. They are the viewer's own slides page: each section a slide on a canvas of a fixed size (980 wide and 16:9 unless `renderers.slides` says otherwise), drawn in the Book layout and scaled as a whole, from the same prebuilt viewer app as the web form. A section's `{hints} slides:` takes `layout` (`default`, `cover`, `center`, `full`), `class` and `zoom`.
  
  - `presmium build --to slides` takes about 2 s for a lecture; `presmium dev --to slides` and the workbench's slides preview are the viewer's page with `?form=slides` (a switch from the document to the slides in the workbench takes about 0.15 s), and an edit reaches the slide as the sections it changed.
  - The exports print that page in Chromium (`playwright-chromium`, an optional peer of `@lincyaw/render-slides`): `pdf`, `png` (a picture of each slide, or of each step) and `pptx` (a picture of each slide, its narration as the speaker notes, with `pptxgenjs`). `presmium-export` and `presmium-diff` use them; `presmium-export` no longer takes `--wait`, since the page tells when it is ready.
  - The exporters' context builds a renderer's output (`ExportContext.build`, in place of `prepare`) and carries the asker's `options`; the compiler's `exportDocument` runs an exporter, for the workspace's jobs and for the command line.
  - Removed: `@lincyaw/addon-core` (the slides' host adapter; a headmatter that still lists it compiles, with a note), every plugin's `setup/` and Slidev layers, the plugins' `vitePlugins` (a plugin's `vite.config.ts` gives the viewer app's build its Vite plugins and Vue's `isCustomElement`), `Renderer.prepare`, `RenderContext.vitePlugins`, the host's `PmStepScope`, the kernel's `servedAssets`, `prebundleDependencies`, `warmDevPage` and `linkBrowserDependencies`, the publish addon's PWA build of the slides, and the slides' themes.
  - The presenter draws on the slides (`d`, or the pen in the presentation's bar: four inks, the eraser, undo, clear) with drauu: each slide's drawing is shared between the presenter's and the audience's windows and the classroom, and kept in the document's `.presmium/drawings/` while a server serves the page (`@lincyaw/addon-stage`). Viewer plugins can put layers on each slide (`scope: 'slide'`) and controls in the presentation's bar (`scope: 'bar'`).
  - A runnable code block can be edited in place before it runs (CodeMirror 6, loaded the first time a block is edited; Mod-Enter runs), and restored, in the pages and the slides alike.
- 2d81267: Bind newly generated speech cache keys to the engine's non-credential configuration profile, including normalized URL, provider, adapter kind and model. Verify actual audio SHA and profile across lookup, direct cached playback and alignment; bind saved alignment to its audio and transcription profile. Preserve committed legacy audio offline through its speech lock, allow one explicitly locked new profile per request offline, and report ambiguous or mismatched results as cache misses without generating audio. Reject engine URLs containing credentials, a query or a fragment.
- 3b2d1aa: Add source-versioned document, page and step voice settings with explicit inheritance, stable step bindings and real service capabilities. Expose provider-owned voice catalogues and exact-text preview quotes; synthesis requires explicit confirmation of the matching quote. Keep reads cache-only, retain valid cached fragments during partial failures, and bind generation and cancellation status to the requested source revision. These services prepare the separate video workflow; they do not add voice or caption controls to document editing.
- 6e3efc5: Share source-bound voice capabilities and real catalogue discovery between Web and MCP without waiting for scene compilation. Preserve actual engine declarations, unsupported catalogues and provider errors; reject source changes during discovery and close outstanding reads with the workspace owner. Shared speech catalogue requests retain independent borrowers and abort their provider request only when the last borrower leaves. Proxy the shared clip preflight and voice capability routes through Studio.
- 6c777cc: Add Settings → Voice Service with a write-only Volcengine API key, owner-authorized local persistence and live application to speech operations. Keep provider authentication separate from local configuration checks and retain explicit confirmation for preview and generation.
