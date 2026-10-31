# create-presmium

## 1.0.0-rc.1

### Minor Changes

- 5248460: 增加课程、文档和展示三种网站主题，以及配色、字体、正文宽度和标志配置。工作区首页可用独立的网站页面 JSON 设计封面、介绍与入口，支持引用文件或内联配置；也可使用自由 HTML、CSS、JavaScript 模板，通过 Vite 打包素材并读取注入的公开文稿集合。原有字符串 `site.landing` 继续支持将一份教学文稿的全文作为首页。教学文稿仍以 `lecture.json` 为唯一内容入口，单篇文稿可选择文章、首页或宽版布局。
  
  `presmium new --type site --theme course|docs|showcase` 创建带独立 `site/home.json` 首页、示例教学文稿和 GitHub Pages 工作流的网站项目；工作流按 Pages 基础路径构建并部署静态网站。已有项目默认保持文档主题，`site.home` 继续使用重定向行为。
  
  首页布局将整份文稿合成一张网页，译本可独立选择布局；实时切换时同步更新正文、分页与当前地址。修复仅修改译本而原文未变时预览不更新的问题，保留原文的增量更新与无变化时的通知抑制。
  
  增加完整产品站点示例：独立双语首页、共享真实线性回归模型的教学文稿与放映版，以及由 Presmium 自身制作的 60 秒产品宣传片、原创音乐和源码下载。宣传片围绕老师备课、组织步骤、比较训练结果、回看与课后探索展开，使用真实工作台和教学输出画面。实时预览支持文稿下的 `slides/` 放映入口，并正确返回当前文稿的阅读地址。

### Patch Changes

- ec3a0be: The presmium-animate skill carries its effect gallery (`gallery/<library>/`, one lecture per animation library), so new lectures and the AI of presmium studio read the example scenes wherever the lecture is, without the Presmium repository. The skill's copy leaves out the gallery's dependencies and build output.
- ac6ced6: The slide layout `full` gives the whole slide to its content: no chapter, title or footer (the title stays in the navigation, the outline and for assistive technology), so a scene can fill a slide and a lecture video frame. Two colour tokens give animations light and shade that hold in both appearances: `sheen` stays light and `shadow` stays dark. The presmium-animate skill adds animation by length (1, 5, 10, 30 and 60 seconds): what each second shows, how short pieces compose into films, how to make short moves look polished (anticipation, calibrated overshoot, reactions, light) and how to export and cut them, with a gallery (`gallery/lengths`) of 42 scenes, among them 24 polished atoms, four per library, each shown once with its beat sheet, and four 30- and 60-second films built from them (`gallery/films`). `references/libraries.md` gains the rules every scene follows and the pitfalls met while building them.
- f32d5ea: The presmium-animate skill's flow-matching example is now drawn in three dimensions with Three.js: time is the third axis, the noise and target planes face each other along it, and each particle's path is a curve between them. The camera moves between the states, the velocity field fills the volume on five time slices, the Euler steps are seen from above the path with space magnified, and the one-step comparison is two views side by side. `references/libraries.md` adds how to put text over a WebGL scene, render two views side by side and magnify a small subject.
- 5af663e: The presmium-animate skill gains a guide from thesis to storyboard (`references/story.md`): stating the claim a piece must prove, finding the picture that proves it, choosing a narrative shape, storyboarding the rest frames before any code, scripting the narration against the picture, pacing, turning interaction into steps, honesty with data, and reviewing with cold viewers. `references/storyboards.md` holds 34 filled-in storyboards for popular science, papers, courses, data and history stories, and products and systems; `references/procedural.md` covers motion computed from mathematics (inverse kinematics, Verlet ropes, springs, Bézier construction, distance fields, flocks, L-systems) and how to keep it seekable. The new gallery document `gallery/story` is the worked example: a narrated flow-matching explainer whose numbers come from a real training run (`scenes/data/flow-matching.py`). The lengths gallery adds a Fourier-series fit that draws any outline with circles and ends in a vector path, and its data story now shows its source on screen.
- 9445f6c: 新建文稿默认只有一页和一个空正文段落，首个页面沿用输入标题。Studio 与 CLI 按结构采用模板标题，保留自定义模板正文、引用文件和其它页面标题。
- 09eb999: The command lines `presmium`, `presmium studio` (`presmium-studio`), `presmium-mcp` and `create-presmium` print their help, progress, summaries and errors in Chinese or English by the system language (`LC_ALL`, `LC_MESSAGES`, `LANG`), with the glossary's words; errors say what failed and what to do next. JSON, URLs, paths, flags and the `serve  <url>`, `workspace  <dir>`, `mcp  <url>`, `studio  <url>` lines are the same in both languages, and the English text that tests and documents quote is unchanged.
  
  MCP approval titles name the operation as a command in the document's language (“导出文稿（网站、幻灯片）” / “Export Document (Website, Slides)”), without tool names, ids or internal names; the explanations of tool error codes follow the glossary and name no tool or field, and denied approvals, pending AI changes and missing permissions have one. The VS Code extension localizes its runtime messages through `vscode.l10n` (`l10n/bundle.l10n.zh-cn.json`).
- f85bc88: 界面文本按术语规范收尾：失败原因（保存、预览、发送给 AI、复刻音色、Jupyter、讲授工具与配音、代码引用参数、提示命令）按代码显示为 zh-CN 与 en 的目录文本，不再显示服务端或浏览器的英文原文；文稿修改的待确认说明改为按页面的简短摘要，不再显示 JSON 与标识；启动报告按插件声明的双语名称显示（`PluginManifest.name`）；视频制作的提示显示本地化的动作名；撤消与恢复的快捷键每个平台只写一种（Apple 设备 ⌘Z、⌘⇧Z，其他 Ctrl+Z、Ctrl+Y）；Jupyter 与 MCP 的凭据叫“访问令牌 / access token”；命令行的系统语言判断移入 `@lincyaw/kernel/node` 的 `systemLocale`。`AgentTool.errors` 让插件工具为它抛出的错误码提供按文稿语言的说明。
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
- 9bd9dda: New projects install with pnpm 11 again: their `allowBuilds` matches the packages Presmium installs, including `protobufjs` from the speech engine. A project whose title is Chinese gets Chinese pages and README whatever the system language, and its first document's language follows; the README of every project kind explains how to edit, in the browser with Presmium Studio or with an AI coding tool.
- 672d5e5: Use React components and host stores for assistant, classroom and session interfaces. Discover React component sources and generate React plugin projects, with matching examples and authoring guidance. Preserve named actions, classroom subscriptions and reversible step rendering through React hooks.
- 08187cf: Scenes get more of each library and stay right when seeked. `d3Scene` draws a D3 graphic as a function of the time. GSAP scenes get the registered `plugins` (SplitText, DrawSVG, MorphSVG, MotionPath, Text, CustomEase, CustomBounce, CustomWiggle, Physics2D, PhysicsProps, Flip) and Three.js scenes the `addons` (CSS2DRenderer, Line2, ParametricGeometry, RoundedBoxGeometry, ConvexGeometry), which a lecture cannot import itself. `color()` returns `rgb()` for every token, including those written with `color-mix()`. A scene is built again when the theme changes, and when its size changes if it has no `resize`; its stage is a size container. Anime.js and GSAP scenes look the same at a time however it was reached (GSAP keeps 2D transforms), a section labelled `(gsap)=` no longer breaks GSAP's plugins, and Motion scenes draw transforms, SVG and CSS variables on the seek instead of on the next frame. New lectures, and the AI of presmium studio, get the presmium-animate skill.
- 01b7cee: Generate projects with the scoped Presmium package and use the project's installed version when invoking the launcher.
- 447d24d: The workbench owns its keyboard. While presenting, Space plays or pauses the lecture (and still moves to the next step when there is nothing to play); in Video Production, Space plays or pauses and the left and right arrows select the previous or next step, also while the preview has the focus (preview frames with `presmium-keys=playback` send them as the `shortcut` commands `play-pause`, `previous` and `next`). Ctrl+S (⌘S) saves at once anywhere, fields included, instead of opening the browser's Save dialog (the `save` shortcut command from the preview). A click no longer makes Space press the clicked button again: `@lincyaw/kernel` exports `keyBelongsToTarget` and `watchFocusSource`, under which text fields, editors, open menus and dialogs keep every key, a control reached with the keyboard keeps the keys it uses, and a clicked control gives Space and the arrows to the page. A viewer plugin's action now runs before the built-in action on the same key. The keys are listed as fixed rows in Settings → Keyboard Shortcuts.
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
