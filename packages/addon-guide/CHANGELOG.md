# @lincyaw/addon-guide

## 1.0.0-rc.8

No changes in this release.

## 1.0.0-rc.7

No changes in this release.

## 1.0.0-rc.6

No changes in this release.

## 1.0.0-rc.5

No changes in this release.

## 1.0.0-rc.4

No changes in this release.

## 1.0.0-rc.3

No changes in this release.

## 1.0.0-rc.2

No changes in this release.

## 1.0.0-rc.1

### Minor Changes

- c5cbc1c: The official plugins are renamed from `@lincyaw/slidev-addon-*` to `@lincyaw/addon-*`. A headmatter or an operator plugin list that still names a plugin the old way loads the renamed package; `presmium check` says the current name once for each (an `info` of `presmium.plugins`), and the IR lists the current names.
- 672d5e5: Unify the viewer, web shell, host and plugin components on React with external stores and shared React modules. Replace the Vue runtime and component sources, including generated plugin projects and examples.
  
  Add a lazy BlockNote body editor with source-preserving MyST saves and explicit narration blocks. Text pages, animation blocks and step narration share the preview protocol; narration timing and animation step navigation remain available during presentation.

### Patch Changes

- f85bc88: 界面文本按术语规范收尾：失败原因（保存、预览、发送给 AI、复刻音色、Jupyter、讲授工具与配音、代码引用参数、提示命令）按代码显示为 zh-CN 与 en 的目录文本，不再显示服务端或浏览器的英文原文；文稿修改的待确认说明改为按页面的简短摘要，不再显示 JSON 与标识；启动报告按插件声明的双语名称显示（`PluginManifest.name`）；视频制作的提示显示本地化的动作名；撤消与恢复的快捷键每个平台只写一种（Apple 设备 ⌘Z、⌘⇧Z，其他 Ctrl+Z、Ctrl+Y）；Jupyter 与 MCP 的凭据叫“访问令牌 / access token”；命令行的系统语言判断移入 `@lincyaw/kernel/node` 的 `systemLocale`。`AgentTool.errors` 让插件工具为它抛出的错误码提供按文稿语言的说明。
- 432a325: Resolve complete visual states and component parameters by authored Step ID, including reverse and arbitrary navigation. Expose local-step and semantic state through the host scope and scene context. Remove the viewer's per-page authoring editors; document editing and native comments now live in the workbench's single JSON editor.
- 5a51d3b: Animations on the steps and on the lecture's time. The new plugin `@lincyaw/addon-motion` adds `{scene}`: a timeline of the document's `scenes/` written with GSAP, Anime.js, Motion, Three.js or Remotion, cut into steps by `:durations:`. The host gains the time in a step (`useStepTime`, driven by the page or by a lecture through `STEP_CLOCK`) and components' named actions (`useActions`), which replay the `click` of a lecture. A component node can declare `durations`, and a synthesized lecture stays on a step until its animations have played. `presmium-lecture export` draws the animations frame by frame at 30 frames a second by default, adds a WebVTT subtitle track for each language of the captions and writes them next to the video, and `--burn <language>` draws the captions on the picture. The guidance cursor glides on the step's time, so videos show it moving. Inside a slide, the slides host's `useCursor` gives that slide and its clicks, so a preview of the next slide stays settled. The renderers give a component node's `durations` to its component as the prop `durations`.
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
- afda9e9: The slides no longer use Slidev. They are the viewer's own slides page: each section a slide on a canvas of a fixed size (980 wide and 16:9 unless `renderers.slides` says otherwise), drawn in the Book layout and scaled as a whole, from the same prebuilt viewer app as the web form. A section's `{hints} slides:` takes `layout` (`default`, `cover`, `center`, `full`), `class` and `zoom`.
  
  - `presmium build --to slides` takes about 2 s for a lecture; `presmium dev --to slides` and the workbench's slides preview are the viewer's page with `?form=slides` (a switch from the document to the slides in the workbench takes about 0.15 s), and an edit reaches the slide as the sections it changed.
  - The exports print that page in Chromium (`playwright-chromium`, an optional peer of `@lincyaw/render-slides`): `pdf`, `png` (a picture of each slide, or of each step) and `pptx` (a picture of each slide, its narration as the speaker notes, with `pptxgenjs`). `presmium-export` and `presmium-diff` use them; `presmium-export` no longer takes `--wait`, since the page tells when it is ready.
  - The exporters' context builds a renderer's output (`ExportContext.build`, in place of `prepare`) and carries the asker's `options`; the compiler's `exportDocument` runs an exporter, for the workspace's jobs and for the command line.
  - Removed: `@lincyaw/addon-core` (the slides' host adapter; a headmatter that still lists it compiles, with a note), every plugin's `setup/` and Slidev layers, the plugins' `vitePlugins` (a plugin's `vite.config.ts` gives the viewer app's build its Vite plugins and Vue's `isCustomElement`), `Renderer.prepare`, `RenderContext.vitePlugins`, the host's `PmStepScope`, the kernel's `servedAssets`, `prebundleDependencies`, `warmDevPage` and `linkBrowserDependencies`, the publish addon's PWA build of the slides, and the slides' themes.
  - The presenter draws on the slides (`d`, or the pen in the presentation's bar: four inks, the eraser, undo, clear) with drauu: each slide's drawing is shared between the presenter's and the audience's windows and the classroom, and kept in the document's `.presmium/drawings/` while a server serves the page (`@lincyaw/addon-stage`). Viewer plugins can put layers on each slide (`scope: 'slide'`) and controls in the presentation's bar (`scope: 'bar'`).
  - A runnable code block can be edited in place before it runs (CodeMirror 6, loaded the first time a block is edited; Mod-Enter runs), and restored, in the pages and the slides alike.
