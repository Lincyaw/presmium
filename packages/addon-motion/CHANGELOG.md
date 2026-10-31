# @lincyaw/addon-motion

## 1.0.0-rc.14

### Patch Changes

- eb70da8: A site's template homepage can play its presentations well. A presentation in a frame tells the embedding page when its scene is drawn and what its lecture is doing (`presmium:state` messages), and `@lincyaw/presmium/site` gives templates `prefetchPresentation` and `whenPresentationReady`; the site data lists each document's presentation (`slides`), also under `presmium serve` before a document is compiled; the theme's stylesheets are linked in the template's head. Where a browser refuses to autoplay, the large Play button is the design system's `PmIconButton variant="overlay"`.
  
  Images are encoded as WebP where they are published (document media, and images scenes and templates import), cached by their content in `.presmium/images/`, before the offline service worker lists the files; nothing is renamed afterwards. A presentation preloads what Vite's build records its scenes and plugins load. A site's presentations name the site's viewer app directly (`appBase`). `presmium serve` answers a lecture's audio with 304 from the file's known hash without reading it, and streams it with byte ranges otherwise. The stale-deploy reload waits until the page is online and reloads at most once in 30 seconds.

## 1.0.0-rc.13

No changes in this release.

## 1.0.0-rc.12

No changes in this release.

## 1.0.0-rc.11

No changes in this release.

## 1.0.0-rc.10

No changes in this release.

## 1.0.0-rc.9

### Patch Changes

- fcaaa81: A page cached from before a new deployment, whose app version the deployment removed, loads again once from the network instead of staying on "Loading the animation…" with its scripts and scenes failing to load.

## 1.0.0-rc.8

No changes in this release.

## 1.0.0-rc.7

No changes in this release.

## 1.0.0-rc.6

No changes in this release.

## 1.0.0-rc.5

### Patch Changes

- 502e516: A presentation asked to play a lecture no longer shows the slides' untimed captions while the lecture loads, and a scene's "Loading the animation…" appears only when loading takes over a second (`--pm-delay-notice`), so a quick load goes from nothing to the picture.

## 1.0.0-rc.4

No changes in this release.

## 1.0.0-rc.3

No changes in this release.

## 1.0.0-rc.2

No changes in this release.

## 1.0.0-rc.1

### Minor Changes

- 432a325: Resolve complete visual states and component parameters by authored Step ID, including reverse and arbitrary navigation. Expose local-step and semantic state through the host scope and scene context. Remove the viewer's per-page authoring editors; document editing and native comments now live in the workbench's single JSON editor.
- 5a51d3b: Animations on the steps and on the lecture's time. The new plugin `@lincyaw/addon-motion` adds `{scene}`: a timeline of the document's `scenes/` written with GSAP, Anime.js, Motion, Three.js or Remotion, cut into steps by `:durations:`. The host gains the time in a step (`useStepTime`, driven by the page or by a lecture through `STEP_CLOCK`) and components' named actions (`useActions`), which replay the `click` of a lecture. A component node can declare `durations`, and a synthesized lecture stays on a step until its animations have played. `presmium-lecture export` draws the animations frame by frame at 30 frames a second by default, adds a WebVTT subtitle track for each language of the captions and writes them next to the video, and `--burn <language>` draws the captions on the picture. The guidance cursor glides on the step's time, so videos show it moving. Inside a slide, the slides host's `useCursor` gives that slide and its clicks, so a preview of the next slide stays settled. The renderers give a component node's `durations` to its component as the prop `durations`.
- c5cbc1c: The official plugins are renamed from `@lincyaw/slidev-addon-*` to `@lincyaw/addon-*`. A headmatter or an operator plugin list that still names a plugin the old way loads the renamed package; `presmium check` says the current name once for each (an `info` of `presmium.plugins`), and the IR lists the current names.
- 672d5e5: Unify the viewer, web shell, host and plugin components on React with external stores and shared React modules. Replace the Vue runtime and component sources, including generated plugin projects and examples.
  
  Add a lazy BlockNote body editor with source-preserving MyST saves and explicit narration blocks. Text pages, animation blocks and step narration share the preview protocol; narration timing and animation step navigation remain available during presentation.
- 08187cf: Scenes get more of each library and stay right when seeked. `d3Scene` draws a D3 graphic as a function of the time. GSAP scenes get the registered `plugins` (SplitText, DrawSVG, MorphSVG, MotionPath, Text, CustomEase, CustomBounce, CustomWiggle, Physics2D, PhysicsProps, Flip) and Three.js scenes the `addons` (CSS2DRenderer, Line2, ParametricGeometry, RoundedBoxGeometry, ConvexGeometry), which a lecture cannot import itself. `color()` returns `rgb()` for every token, including those written with `color-mix()`. A scene is built again when the theme changes, and when its size changes if it has no `resize`; its stage is a size container. Anime.js and GSAP scenes look the same at a time however it was reached (GSAP keeps 2D transforms), a section labelled `(gsap)=` no longer breaks GSAP's plugins, and Motion scenes draw transforms, SVG and CSS variables on the seek instead of on the next frame. New lectures, and the AI of presmium studio, get the presmium-animate skill.
- afda9e9: The slides no longer use Slidev. They are the viewer's own slides page: each section a slide on a canvas of a fixed size (980 wide and 16:9 unless `renderers.slides` says otherwise), drawn in the Book layout and scaled as a whole, from the same prebuilt viewer app as the web form. A section's `{hints} slides:` takes `layout` (`default`, `cover`, `center`, `full`), `class` and `zoom`.
  
  - `presmium build --to slides` takes about 2 s for a lecture; `presmium dev --to slides` and the workbench's slides preview are the viewer's page with `?form=slides` (a switch from the document to the slides in the workbench takes about 0.15 s), and an edit reaches the slide as the sections it changed.
  - The exports print that page in Chromium (`playwright-chromium`, an optional peer of `@lincyaw/render-slides`): `pdf`, `png` (a picture of each slide, or of each step) and `pptx` (a picture of each slide, its narration as the speaker notes, with `pptxgenjs`). `presmium-export` and `presmium-diff` use them; `presmium-export` no longer takes `--wait`, since the page tells when it is ready.
  - The exporters' context builds a renderer's output (`ExportContext.build`, in place of `prepare`) and carries the asker's `options`; the compiler's `exportDocument` runs an exporter, for the workspace's jobs and for the command line.
  - Removed: `@lincyaw/addon-core` (the slides' host adapter; a headmatter that still lists it compiles, with a note), every plugin's `setup/` and Slidev layers, the plugins' `vitePlugins` (a plugin's `vite.config.ts` gives the viewer app's build its Vite plugins and Vue's `isCustomElement`), `Renderer.prepare`, `RenderContext.vitePlugins`, the host's `PmStepScope`, the kernel's `servedAssets`, `prebundleDependencies`, `warmDevPage` and `linkBrowserDependencies`, the publish addon's PWA build of the slides, and the slides' themes.
  - The presenter draws on the slides (`d`, or the pen in the presentation's bar: four inks, the eraser, undo, clear) with drauu: each slide's drawing is shared between the presenter's and the audience's windows and the classroom, and kept in the document's `.presmium/drawings/` while a server serves the page (`@lincyaw/addon-stage`). Viewer plugins can put layers on each slide (`scope: 'slide'`) and controls in the presentation's bar (`scope: 'bar'`).
  - A runnable code block can be edited in place before it runs (CodeMirror 6, loaded the first time a block is edited; Mod-Enter runs), and restored, in the pages and the slides alike.
- 672d5e5: Edit narration and captions for each presentation step in the workbench, with a choice of speaking during or after its animation. Save explicit step bindings in MyST, preserve drafts and source conflicts, and use the same timing for playback and video captions. Replace author role banners with compact icons and page/step references; add direct animation step buttons and a presentation step menu. Keep the current step while preparing or refreshing narration playback.

### Patch Changes

- e6f2ba8: A scene's first frame waits for the page's fonts (before the build, so canvas text uses them) and for every `<img>` it shows to decode, so a video export opens on the picture. A `threeScene` build may be async, to load textures before the first frame. The presmium-animate skill adds `gallery/catalog`: 80 scenes adapted from the HyperFrames catalog (transitions and camera moves, annotation and pointers, product screens, code and data, captions and type, motion, shaders and 3D) whose text, images and data are parameters, indexed in "Find an effect"; scene CSS is scoped to its frame; the story, length and asset references gain a brief with options and approval gates, sound and music, rhythm and self-review.
- 2744156: Unify document authoring around body blocks, generated content with source/preview views, and step narration. Edit a generated block's own code or MyST configuration without replacing its animation. Keep drafts across view changes and code reloads, report syntax errors and version conflicts, and retain the selected step.
  
  New animation blocks create independent source files and document references in one versioned transaction. Failed transactions restore files and the Git index; one undo removes both related changes.
- 4cecb11: Defer scene construction outside the reading viewport while preserving instances once shown. Presentation, print and video export continue to create the active scene immediately, so their step and frame behavior stays deterministic.
- 9049893: Make document widgets directly interactive and replace the interaction switch with an accessible refresh icon, retaining loading and disabled feedback. Resolve explicit preview steps through complete semantic state and parameters while preserving reader controls.
  
  Carry discrete boundaries from the existing local animation clock into source step navigation, including the first Play on a first-page animation. Preserve playback through scene state changes and keep initial reading defaults separate from actual user navigation. Ordinary reader playback does not acquire document widget navigation behavior.
- 5248460: Three.js 场景按实际显示尺寸与设备像素比配置绘图缓冲区，避免放映画布经 CSS 放大后仍使用较小缓冲区，导致网页与视频中的图形模糊。逻辑排版尺寸保持不变，尺寸变化时同步通知后处理场景。
  
  视频导出使用完整画幅，不再带普通放映预览的外围留白、画布阴影和场景圆角。
- a9325fe: 读者、讲者看到的界面文字按界面术语与文案规范（docs/glossary.md）统一：演示者视图、观众视图、结束放映、讲稿与配音、撤消、更新（不再显示“重新编译”）、网页视图；en 的命令、窗格与视图用 Title Case，消息与字段用 sentence case，弯引号与美式拼写（Canceled）。启动报告、对话框的“关闭”、站点启动失败与审批失败的提示改为目录文本；读者问答按共享的界面语言规则（`currentLocale()`）告诉模型用哪种语言回答；Notebook 中的终端说明、手动字幕过期提示、配音试听文字按文稿的 `lang` 取自目录。
- 8e0c72f: Render animations and components inside the native document editor using isolated read-only block hosts. Load visible blocks without additional event streams, match saved source and runtime snapshots, and refresh when project code changes. Preserve native text selection and editing, provide direct runtime interaction and step-linked native caption/script editing, and share compact/touch controls and preview states through the design system.
- 32be204: 文档内预览失败后以紧凑的可读 fallback 和原刷新入口恢复，暂停并移除旧画面，拒绝晚到的旧状态。内联 HTTP 错误保留完整诊断并局部反馈，显式放映、网络和保存失败继续全局反馈，互不清除。
  
  文档内动画初次加载与重载显示当前步骤完成画面；播放从所选步骤起点重播，中途暂停可继续，拖动进度条保留明确定位。
- 7e136ff: 修复动画在放映中缩在左上角的问题：不为所有步骤都隐藏的内容保留布局空间，居中缩放后的内容，动画使用放映可用宽度，并以变换前的布局尺寸初始化和调整场景。
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
- 65c0a2a: Resolve canonical state and parameters when using scene controls in the document reader. Local animation playback keeps its existing clock and no longer retains the final reading snapshot after jumping to an earlier animation step. Reader controls stay local to their scene instead of navigating to another document section, and keep their selected local state while the reader scrolls.
- 5f4e718: Authorize embedded document animation playback from the first render through a request-bound parent handshake. Preserve the existing animation clock while rejecting cancelled, expired and prior-load grants, and guard animation starts and frames against late work after pause.
- ef0a065: Add a typed, version-bound seek/pause protocol for read-only document widgets. Validate the parent window and origin, document, block ownership and stable step before navigating. Initial and reload seeks can choose a step's start; ordinary explicit seeks retain completed-step behavior.
  
  Register local scene playback with the existing playback coordinator, so pausing a widget cancels pending starts and stops its current animation frame without losing time. Navigation boundaries remain transient runtime intent and never duplicate authoring or production timing.
- 0753ac6: A Remotion scene exported to video shows every frame: the lecture export asks for whole milliseconds (frame 1 at 30 fps is 33 ms), which the scene turned into the frame before, so every third exported frame repeated the previous one. Live playback was not affected.
- 34e51cb: 修复保留修改时间的文件替换和编译期间编辑导致的缓存过期问题，共用完整本机文件版本标识。各文稿的离线缓存独立更新，打开另一份文稿后仍可离线访问原文稿。语言服务使用文稿安装的 Presmium 入口及随附插件。
  
  修复连续调整尺寸时旧动画构建覆盖新画面、GSAP 构建失败后残留动画，以及切换或关闭课堂连接后的文档与订阅资源释放。
- 7206ad4: Keep a scene's picture on screen while it is rebuilt for another step's state, the theme or a new size. The new scene is made in a hidden layer of the stage and replaces the shown one in one task, so a step change no longer paints the scene's authored DOM (all of a `from()` reveal's later elements, or the reverted start) for a frame or two before the step's animation.
- ae6b2a0: The workbench shows the web form in a prebuilt viewer, as a PDF viewer shows any PDF: no dev server per document.
  
  - `@lincyaw/web`: the viewer app (the web form's runtime with the workspace's plugins, built once into the user's cache and shared by every workspace) and each document's own code in a small bundle that imports Vue, Presmium's packages and the plugins' public subpaths through the app's import map. The workspace site serves them below `<base>__app/` (`SiteDevServer.app`); a document whose plugins bring Vite plugins of their own still goes to its dev server. A document's typography is our own stylesheet (`.pm-document`), the same on the site and in the viewer.
  - `@lincyaw/kernel`: `PresmiumNodePlugin.documentModules`, the virtual modules a plugin generates for each document, which the viewer takes from the document's bundle; `SiteDevServer.app`; `PREVIEW_APPEARANCE_PARAM` and `previewAppearance()`, so that a preview's first paint has the workbench's appearance.
  - `@lincyaw/addon-motion`: gives the document's scenes as a document module.
  - `@lincyaw/workspace`: `preview` answers the viewer's page once it is built (an opened document waits for it a while; a prefetch only starts it), else the dev server's.
  - `@lincyaw/workbench`: previews load with the workbench's appearance in their address.
  - `@lincyaw/viewer`: the page view's root has the `pm-document` class.
  - `@lincyaw/design`: `--pm-space-12`.
