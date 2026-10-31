# @lincyaw/cli

## 1.0.0-rc.10

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.10
  - @lincyaw/kernel@1.0.0-rc.10
  - @lincyaw/server@1.0.0-rc.10
  - @lincyaw/skills@1.0.0-rc.10
  - @lincyaw/workspace@1.0.0-rc.10

## 1.0.0-rc.9

### Patch Changes

- Updated dependencies [fcaaa81]
  - @lincyaw/kernel@1.0.0-rc.9
  - @lincyaw/compiler@1.0.0-rc.9
  - @lincyaw/server@1.0.0-rc.9
  - @lincyaw/skills@1.0.0-rc.9
  - @lincyaw/workspace@1.0.0-rc.9

## 1.0.0-rc.8

### Patch Changes

- Updated dependencies [6b33a28]
  - @lincyaw/workspace@1.0.0-rc.8
  - @lincyaw/compiler@1.0.0-rc.8
  - @lincyaw/kernel@1.0.0-rc.8
  - @lincyaw/server@1.0.0-rc.8
  - @lincyaw/skills@1.0.0-rc.8

## 1.0.0-rc.7

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.7
  - @lincyaw/kernel@1.0.0-rc.7
  - @lincyaw/server@1.0.0-rc.7
  - @lincyaw/skills@1.0.0-rc.7
  - @lincyaw/workspace@1.0.0-rc.7

## 1.0.0-rc.6

### Patch Changes

- Updated dependencies [8defdc2]
  - @lincyaw/workspace@1.0.0-rc.6
  - @lincyaw/compiler@1.0.0-rc.6
  - @lincyaw/kernel@1.0.0-rc.6
  - @lincyaw/server@1.0.0-rc.6
  - @lincyaw/skills@1.0.0-rc.6

## 1.0.0-rc.5

### Patch Changes

- Updated dependencies [e1fcfaf]
- Updated dependencies [4da0afc]
  - @lincyaw/kernel@1.0.0-rc.5
  - @lincyaw/workspace@1.0.0-rc.5
  - @lincyaw/compiler@1.0.0-rc.5
  - @lincyaw/server@1.0.0-rc.5
  - @lincyaw/skills@1.0.0-rc.5

## 1.0.0-rc.4

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.4
  - @lincyaw/kernel@1.0.0-rc.4
  - @lincyaw/server@1.0.0-rc.4
  - @lincyaw/skills@1.0.0-rc.4
  - @lincyaw/workspace@1.0.0-rc.4

## 1.0.0-rc.3

### Patch Changes

- Updated dependencies [bea12b0]
  - @lincyaw/workspace@1.0.0-rc.3
  - @lincyaw/compiler@1.0.0-rc.3
  - @lincyaw/kernel@1.0.0-rc.3
  - @lincyaw/server@1.0.0-rc.3
  - @lincyaw/skills@1.0.0-rc.3

## 1.0.0-rc.2

### Patch Changes

- @lincyaw/compiler@1.0.0-rc.2
  - @lincyaw/kernel@1.0.0-rc.2
  - @lincyaw/server@1.0.0-rc.2
  - @lincyaw/skills@1.0.0-rc.2
  - @lincyaw/workspace@1.0.0-rc.2

## 1.0.0-rc.1

### Minor Changes

- d20d5ad: Presmium Studio 与工作区服务可以放在反向代理之后：`presmium serve --public-url <来源>` 信任该来源的主机，并用它给出预览与导出产物的地址；`presmium studio --public-url <网址> --preview-url <来源>` 把浏览器使用的根地址交给 DeepSeek Harness（`--public-url`、`--trusted-host`），把预览的来源交给工作区服务。Presmium 云端用它为每个用户运行完整的 Studio。设计系统新增 `share` 与 `stop` 图标。
- ec5afeb: 工作区服务可以放在一个路径下面：`presmium serve --public-url https://host/user/a/preview/` 时，网站、预览、导出产物与 `__presmium/` 路由都在该路径下，代理原样转发路径即可（例如 JupyterHub 的 jupyter-server-proxy）。页面的 `AppConfig.server` 给出这个前缀，`@lincyaw/host` 的服务端客户端与控制通道据此访问路由，并新增 `pluginRoutePath` 供插件拼出自己的路由；Jupyter 执行环境与课堂同步改用它。路径不同的导出不会互相复用产物。`presmium studio` 新增 `--preview-port`，并把带启动令牌的地址写进 0600 的状态文件；工作台对文稿上下文的请求改为相对地址，可在路径下工作。
- 1d12f47: Share the four authoring, animation, presentation and plugin-development skills across Studio, MCP and VSIX. Add bounded skill discovery and reading without a document, plus a project installer that preserves existing skills.
- 5248460: 增加课程、文档和展示三种网站主题，以及配色、字体、正文宽度和标志配置。工作区首页可用独立的网站页面 JSON 设计封面、介绍与入口，支持引用文件或内联配置；也可使用自由 HTML、CSS、JavaScript 模板，通过 Vite 打包素材并读取注入的公开文稿集合。原有字符串 `site.landing` 继续支持将一份教学文稿的全文作为首页。教学文稿仍以 `lecture.json` 为唯一内容入口，单篇文稿可选择文章、首页或宽版布局。
  
  `presmium new --type site --theme course|docs|showcase` 创建带独立 `site/home.json` 首页、示例教学文稿和 GitHub Pages 工作流的网站项目；工作流按 Pages 基础路径构建并部署静态网站。已有项目默认保持文档主题，`site.home` 继续使用重定向行为。
  
  首页布局将整份文稿合成一张网页，译本可独立选择布局；实时切换时同步更新正文、分页与当前地址。修复仅修改译本而原文未变时预览不更新的问题，保留原文的增量更新与无变化时的通知抑制。
  
  增加完整产品站点示例：独立双语首页、共享真实线性回归模型的教学文稿与放映版，以及由 Presmium 自身制作的 60 秒产品宣传片、原创音乐和源码下载。宣传片围绕老师备课、组织步骤、比较训练结果、回看与课后探索展开，使用真实工作台和教学输出画面。实时预览支持文稿下的 `slides/` 放映入口，并正确返回当前文稿的阅读地址。

### Patch Changes

- 01b7cee: Publish current compilation, preview, runtime and server diagnostics through one snapshot with SSE and MCP resource subscriptions. Show concrete problems in the workbench and remove resolved or obsolete contributions without rerunning full checks when a subscriber reads the snapshot.
- 09eb999: The command lines `presmium`, `presmium studio` (`presmium-studio`), `presmium-mcp` and `create-presmium` print their help, progress, summaries and errors in Chinese or English by the system language (`LC_ALL`, `LC_MESSAGES`, `LANG`), with the glossary's words; errors say what failed and what to do next. JSON, URLs, paths, flags and the `serve  <url>`, `workspace  <dir>`, `mcp  <url>`, `studio  <url>` lines are the same in both languages, and the English text that tests and documents quote is unchanged.
  
  MCP approval titles name the operation as a command in the document's language (“导出文稿（网站、幻灯片）” / “Export Document (Website, Slides)”), without tool names, ids or internal names; the explanations of tool error codes follow the glossary and name no tool or field, and denied approvals, pending AI changes and missing permissions have one. The VS Code extension localizes its runtime messages through `vscode.l10n` (`l10n/bundle.l10n.zh-cn.json`).
- f85bc88: 界面文本按术语规范收尾：失败原因（保存、预览、发送给 AI、复刻音色、Jupyter、讲授工具与配音、代码引用参数、提示命令）按代码显示为 zh-CN 与 en 的目录文本，不再显示服务端或浏览器的英文原文；文稿修改的待确认说明改为按页面的简短摘要，不再显示 JSON 与标识；启动报告按插件声明的双语名称显示（`PluginManifest.name`）；视频制作的提示显示本地化的动作名；撤消与恢复的快捷键每个平台只写一种（Apple 设备 ⌘Z、⌘⇧Z，其他 Ctrl+Z、Ctrl+Y）；Jupyter 与 MCP 的凭据叫“访问令牌 / access token”；命令行的系统语言判断移入 `@lincyaw/kernel/node` 的 `systemLocale`。`AgentTool.errors` 让插件工具为它抛出的错误码提供按文稿语言的说明。
- 8788569: Reuse unchanged Markdown fragments and built-in sections during editing, merge rapid saves and cancel obsolete compilations. Preserve complete IR validation and numbering while reducing repeated traversal. Serialize host compilations and bound common native thread pools in preview, build and execution child processes so background work leaves resources for other applications.
- 3b284ac: Lecture videos are sharper. With FFmpeg installed (`ffmpeg` on the path, or `PRESMIUM_FFMPEG`), the export writes MP4 (H.264, AAC, captions as a subtitle track) from lossless frames; without it the browser encodes WebM at a bitrate scaled to the frame size, and the export says how to install FFmpeg. The default size is 1920×1080. `presmium serve` names the install command when FFmpeg is missing, and the Studio image includes it.
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
- 01b7cee: Refresh document server contributions when plugin configuration or language changes in a development session. Keep existing contributions running for body-only edits.
- Updated dependencies [0e2d705]
- Updated dependencies [e6f2ba8]
- Updated dependencies [17a25b3]
- Updated dependencies [6a2db7b]
- Updated dependencies [05448a8]
- Updated dependencies [219bf74]
- Updated dependencies [9445f6c]
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
- Updated dependencies [18bd137]
- Updated dependencies [01b7cee]
- Updated dependencies [18781ba]
- Updated dependencies [4634709]
- Updated dependencies [21b2143]
- Updated dependencies [672d5e5]
- Updated dependencies [dd94d7f]
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
- Updated dependencies [4e7cb7a]
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
- Updated dependencies [01b7cee]
- Updated dependencies [a2039e8]
- Updated dependencies [db3b832]
- Updated dependencies [4798c02]
- Updated dependencies [4cb9a17]
- Updated dependencies [b4e1194]
- Updated dependencies [8008b64]
- Updated dependencies [1bdd5e1]
- Updated dependencies [e4f26da]
- Updated dependencies [06f9ad2]
- Updated dependencies [fa52184]
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
- Updated dependencies [0b488f8]
- Updated dependencies [34e51cb]
- Updated dependencies [34e51cb]
- Updated dependencies [e316ba8]
- Updated dependencies [cd822fa]
- Updated dependencies [2e439f7]
- Updated dependencies [34e51cb]
- Updated dependencies [87113ae]
- Updated dependencies [40472dd]
- Updated dependencies [1953b39]
- Updated dependencies [594c151]
- Updated dependencies [ec5afeb]
- Updated dependencies [01b7cee]
- Updated dependencies [01b7cee]
- Updated dependencies [1d12f47]
- Updated dependencies [44c1a37]
- Updated dependencies [470fd59]
- Updated dependencies [a2039e8]
- Updated dependencies [6e3efc5]
- Updated dependencies [43f2efd]
- Updated dependencies [5f3f4b0]
- Updated dependencies [445390b]
- Updated dependencies [c403261]
- Updated dependencies [81e7767]
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
- Updated dependencies [01b7cee]
- Updated dependencies [dcb6ad0]
- Updated dependencies [e544bdb]
- Updated dependencies [01b7cee]
- Updated dependencies [01b7cee]
  - @lincyaw/kernel@1.0.0-rc.1
  - @lincyaw/skills@1.0.0-rc.1
  - @lincyaw/workspace@1.0.0-rc.1
  - @lincyaw/server@1.0.0-rc.1
  - @lincyaw/compiler@1.0.0-rc.1
