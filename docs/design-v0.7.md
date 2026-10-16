# v0.7 总体设计

> **说明（WP-72）**：本文的定稿已经并入下列文档，实现以它们为准；本文保留为取舍的理由与调研结论的记录，不再随实现更新（第 11 节先行验证的结论除外）。
>
> | 本文 | 并入 |
> |---|---|
> | 第 1 节 设计原则 | `architecture.md` 第 10、11 节；`domain-model.md` 第 2 节（外部系统只经防腐层） |
> | 第 2 节 总体结构 | `architecture.md` 第 1 节、10.1 节 |
> | 第 3 节 跨上下文契约 | `architecture.md` 4.2、4.4、4.5 节与 4.6 至 4.10 节（精确的签名，由 WP-73a 写入契约源码） |
> | 第 4 节 执行环境 | `domain-model.md` 第 12 节；`ir.md` 2.7 节、第 4 节、6.1 节；`templates/env/`（WP-76） |
> | 第 5 节 智能体 | `domain-model.md` 第 13 节；`architecture.md` 4.8 节、第 10 节 |
> | 第 6 节 工作区 | `domain-model.md` 第 14 节；`ir.md` 6.3 节、第 10 节；`architecture.md` 10.5 节 |
> | 第 7 节 讲授 | `domain-model.md` 第 15 节；`ir.md` 2.8、2.9 节与第 9 节；`architecture.md` 4.8、4.9 节 |
> | 第 8 节 服务端与部署 | `architecture.md` 第 10 节 |
> | 第 9 节 安全 | `architecture.md` 第 11 节 |
> | 第 10 节 测试策略 | `architecture.md` 第 7 节 |
> | 第 11 节 先行验证 | `wbs.md` 各工作包的“先行验证”；结论写回本文第 11 节 |
> | 第 12 节 包与工作包 | `architecture.md` 第 2 节；`wbs.md` 的 I、J、J2 波次 |
> | M9（v0.8 新增，本文未覆盖） | `domain-model.md` 7A、8、9、10 节；`ir.md` 2.10 至 2.14 节、6.2 节；`wbs.md` 的 WP-85 至 WP-88 |
>
> 定稿与本文不同之处（理由见括号）：
>
> 1. **服务端的位置**（3.4 节）：服务端不是 Vite 开发服务器的中间件，而是 `presmium dev`、`presmium serve` 主进程中的一个 HTTP 服务（`@presmium/server`），渲染端的开发服务器把 `/__presmium/` 代理到它。网页的开发服务器是 VitePress 命令行起的子进程（`packages/web/src/node/vitepress.ts`），编译结果、MCP 与 agent 适配都在主进程中，中间件拿不到它们。`presmium serve` 中服务端是唯一对外的端口，其余路径转发到工作区站点的开发服务器。
> 2. **契约的细化**（3.3、3.4 节）：`services` 是接收文稿配置与凭据访问的函数；`RequestContext` 带成员、文档与路由之后的路径；路由与代理声明所需的最低角色。新增本文没有的契约：`APPROVALS`（确认的关口）、`STATUS`（插件的状态摘要，供 `get_classroom`）、`EDIT_MODE`、插件贡献的 agent 工具 `AgentTool`（例如讲授插件的 `lecture_preview`，MCP 包因此不依赖插件）、工作区站点 `SiteSpec` 与 `Renderer.buildSite`、译本与受众的 IR 字段。
> 3. **指定执行器**（4.2 节）：本文说路由器不需要修改；按 `review-round2.md` 决定 5，`RunRequest.executor` 由路由精确匹配，IR 运行时不再自己挑选首选执行器，所以路由与 IR 运行时都要改（WP-73b）。
> 4. **MCP**（5.2 节）：除工具外也提供只读资源，放映位置的资源可以订阅（P-110 要求以资源更新通知推送；DeepSeek Harness 不读资源，仍用 `get_position`）。学习者的权限由服务端签发的令牌决定，不由 `/mcp?role=learner` 这样的请求参数决定。stdio 方式是辅助命令 `presmium-mcp`，不是 `presmium mcp`（同其他辅助命令的约定，也避免 WP-78 与 WP-79 同改 CLI）。
> 5. **确认策略不来自文稿**：本文（以及调研记录中的 `presmium: { assistant: { operate } }`）把策略放在文稿配置中；定稿只允许本机作者的命令行与工作区所有者的配置设置，文稿不能关闭确认。
> 6. **工作包的划分**（第 12 节）：WP-73 拆为 WP-73a（全部契约与服务端）与 WP-73b（环境、会话与富输出）；`OPERATIONS` 由 WP-73a 实现（原为 WP-77），`go` 由 IR 运行时报告、`run` 由执行插件报告，讲授一线因此不改执行插件；P-46 从 WP-86 移到 WP-85；P-137 的格式与导出在 WP-77，由 agent 生成译文在 WP-84；P-132、P-133 在讲授轨中的串联在 WP-83。都是为了同一时间并行的工作包不改同一个文件。
> 7. **语音契约**（7.4 节）：`lang` 是 BCP 47 标签而不是界面语言 `Locale`（文稿的语言可以是 Presmium 界面没有翻译的语言）；引擎信息增加 `provider`，界面据此标明服务提供方（N-08）。
> 8. **单独的讲授脚本**（7.3 节）：本文说不需要另写文件；P-134 要求也能从单独的讲授脚本生成，定稿增加 `renderers.lecture.script`（按章节标签代替讲解），讲解本身仍是默认的脚本。
> 9. **路由的路径**：插件的路由都挂在 `/__presmium/<插件 ID>/` 下，所以语音网关是 `/__presmium/presmium.speech/v1/`，环境代理是 `/__presmium/presmium.execJupyter/env/<名>/`，助手是 `/__presmium/presmium.assistant/tasks`。
> 10. **富输出中的 HTML**（4.5、9 节）：网页中用 DOMPurify 清洗后内联显示（表格因此可以被搜索、样式一致），幻灯片中放进没有脚本权限的沙箱 iframe。
> 11. **讲授渲染端是站点渲染端**：它的产物在 `dist/lecture/`，网页的讲授视图从同一站点读取；与网页一同构建时，按已有规则网页的默认 `base` 为 `/web/`。

本文是需求 v0.7 新增范围（`requirements.md` 6.10 至 6.14 节，N-08、N-09）的总体架构：执行环境、智能体、工作区、讲授四个新的限界上下文，以及它们共用的服务端与契约。WP-72 把定稿的内容并入 `domain-model.md`、`architecture.md`、`ir.md` 与契约源码；在那之前，本文是新增范围的设计依据。调研记录（DeepSeek Harness、浏览器 GPU、远端环境、语音）的结论已经吸收进本文，出处见各节。

## 1. 设计原则

v0.7 沿用 `requirements.md` 第 1 节的六条原则，并补充以下五条，作为新增范围的取舍依据：

1. **边界是标准协议，部署差异交给现成的基础设施。** Presmium 只实现一个客户端，不按平台或厂商写插件：

   | 边界 | 采用的标准协议或格式 |
   |---|---|
   | 远端执行 | Jupyter 内核协议 |
   | agent 读写文稿 | MCP |
   | 驱动 agent | ACP（Agent Client Protocol） |
   | 富输出 | nbformat 的输出模型 |
   | 字幕与章节 | WebVTT |
   | 修改历史 | git |

   厂商专有的接口只出现在一个适配器里，例如语音服务。
2. **服务端能力也是插件。** 插件可以为服务端贡献路由与服务，`presmium dev` 与工作区服务以同一种方式挂载它们（3.4 节）。插件的边界因此不随“浏览器端还是服务端”而断开。
3. **密钥只在服务端。** 模型、语音、远端环境的凭据只来自服务端的环境变量或登录。文稿、构建产物和浏览器都不持有长期凭据；浏览器经服务端的代理访问需要凭据的服务。
4. **一切修改都落在源码上，并成为提交。** agent 的修改与文档管理操作都是对源码目录的修改，由工作区服务提交到 git，撤销即 `git revert`。浏览器不直接修改渲染结果（原则 6）。
5. **操作是语义化的、可重放的。** 讲授中的操作（翻页、步骤、指针、高亮、运行）以章节、块与锚点为坐标记录，不以像素或视频记录。组件的视觉状态本来就是步骤的纯函数（K-04），回放只需重建光标与少量插件状态。

## 2. 总体结构

```
浏览器                                   工作区服务（presmium serve）/ presmium dev（Node）              外部
─────────────────────────────            ─────────────────────────────────────────────            ─────────────
IR 运行时（viewer）+ 插件组件             编译器 · IR · 实时推送（K-11）
  ├ 执行：Pyodide · WASI · WebGPU ───────► 环境代理 /__presmium/env/<名>（加凭据）────────────────► Jupyter Server（compose / k8s / 沙箱 / GPU）
  ├ 讲授：录制 · 回放（音频为时钟）───────► 语音路由 /__presmium/speech（加凭据）─────────────────► 语音服务（火山引擎 / 免费测试服务）
  ├ 助手：问答 · 批注 · 对话 ──── SSE ───► agent 适配（ACP 客户端）──── stdio ACP ────────────────► DeepSeek Harness（子进程）
  │                                          ▲                                                       │
  │                                          └──── MCP（本机，token）◄─────── mcp__presmium__* ──────┘
  └ 工作区：文档列表 · 修改历史 ─────────► 文档管理 · 修改提交（git）· 登录（反向代理传来的身份）
                                          课堂服务（y-websocket，P-61，独立进程，不变）
```

- **两个服务端入口共用同一套机制：**
  - `presmium dev`：作者本机预览单份文稿，只监听本机，不变。
  - `presmium serve`：工作区服务，新增。它在 `dev` 的编译与实时推送之上，加入多文档、编辑模式、agent、修改历史与登录。本机启动时只监听本机；部署时放在登录代理之后（8.2 节）。
- **静态构建产物仍然不依赖任何服务端（N-03、N-09）：**
  - 浏览器内执行：Pyodide、WASI、WebGPU。
  - 预先合成的讲授音频。
  - 录制输出。
  
  需要服务端的功能在静态产物中自动隐藏或降级：agent、远端环境的代理模式、实时转写。

## 3. 跨上下文契约

全部是兼容扩展：只增加可选字段与新的服务令牌，`IR_VERSION` 不变，现有插件与文稿不受影响。

### 3.1 执行（`contracts.ts`）

```ts
export interface RunRequest {
  /** 同一会话的运行共享解释器状态，按请求顺序执行；不支持会话的执行器忽略它 */
  session?: string
}
/** nbformat v4 的单元格输出（结构复制，内核不依赖 nbformat 包） */
export type RunOutput =
  | { output_type: 'stream', name: 'stdout' | 'stderr', text: string }
  | { output_type: 'display_data' | 'execute_result', data: Record<string, unknown>, metadata?: Record<string, unknown> }
  | { output_type: 'error', ename: string, evalue: string, traceback: string[] }
export interface RunResult {
  /** 富输出；stdout、stderr 仍是文本流的拼接，旧的使用方不受影响 */
  outputs?: RunOutput[]
}
export interface Executor {
  /** 丢弃会话状态（重启或关闭内核）；用于“重置”和构建结束时 */
  endSession?(session: string): Promise<void>
}
```

### 3.2 IR（`ir.ts`）

- `RunSpec.session?: string`：执行会话。
- `RunSpec.executor`：已有字段，存放 `:env:` 编译后的执行器 ID（4.2 节）。
- `RecordedRun` 继承 `RunResult.outputs`。录制中的大块 MIME 数据（图片等）按内容哈希存为 `.presmium/freeze/blobs/<hash>`，录制只保存引用。
- 编译器增加行内角色的扩展点：`PresmiumNodePlugin.roles?: RoleSpec[]`（与 `DirectiveSpec` 并列，选项写在角色名之后，例如 ``{cue to=code-1 lines=3-5}`spot` ``，已验证 myst-parser 能解析）。现在编译器把不认识的角色压平为文字，注册了的角色则保留为 mdast 节点 `{ type: 'presmiumRole', plugin, name, options, children }`，不认识它的渲染端只显示其子内容（7.3 节的 `{cue}`、`{say}`）。
- 新的媒介 ID `lecture`：`{only} lecture` 标出只用于讲授（只说不显示）的文字，`{only} web, slides` 标出只显示不说的文字（K-18）。

### 3.3 Node 端服务注册（`PresmiumNodePlugin`）

浏览器端已经有服务注册（K-08）；Node 端目前只有 `executors` 这一种贡献方式。v0.7 在 Node 端增加同样的服务注册，执行、语音、agent、修改历史等都通过它协作：

```ts
export interface PresmiumNodePlugin {
  /** Node 端服务实现，例如 SPEECH_ENGINE、REVISIONS */
  services?: [ServiceToken<unknown>, unknown][]
  /** 具名环境的提供方：按文稿头部 execute.environments 中的 kind 创建执行器（4.2 节） */
  environments?: Record<string, EnvironmentProvider>
  /** 服务端路由与通道，由 presmium dev / serve 挂载（3.4 节） */
  server?(ctx: ServerContext): ServerContribution
}
export interface PassContext { service<T>(token: ServiceToken<T>): T | undefined }
```

### 3.4 服务端贡献

```ts
export interface ServerContribution {
  /** 挂在 /__presmium/<插件 ID>/ 下；标准 Fetch 的 Request → Response，流式结果用 SSE */
  routes?: Record<string, (request: Request, ctx: RequestContext) => Response | Promise<Response>>
  /** 需要 WebSocket 的反向代理（例如 Jupyter 内核通道） */
  proxies?: { path: string, target: string, headers?: Record<string, string> }[]
}
export interface RequestContext { user?: { id: string, name: string, roles: string[] }, deck?: string }
```

关于服务端机制的几点约定：

- **请求的公共处理**：`presmium dev` 与 `presmium serve` 把各插件的贡献挂到同一个 HTTP 服务（Vite 开发服务器的中间件）。身份、权限与只监听本机的检查在挂载点统一处理，插件不各自实现。
- **处理函数**：用标准 Fetch API 写，不绑定具体的服务器框架。
- **反向代理**：用现成的代理库。
- **浏览器端调用**：通过 `@presmium/host` 新增的 `useServer()` 访问这些路由。它返回 `{ available, fetch(plugin, path, init), events(plugin, path) }`；静态产物中 `available` 为 false，组件据此隐藏或降级。

### 3.5 新的服务令牌

| 令牌 | 位置 | 提供方 | 使用方 |
|---|---|---|---|
| `SPEECH` | kernel | 语音插件（浏览器端经语音网关，Node 端直接调用引擎） | 讲授插件（录制转写、合成、构建时合成）、agent 工具 |
| `AGENT`（浏览器）、`AGENT_RUNTIME`（Node） | kernel | 助手插件 | 工作区（文档起草）、讲授（转写回写，P-136） |
| `REVISIONS`（Node） | kernel | 工作区 | 助手（每批修改提交）、文档管理 |
| `OPERATIONS`（浏览器），事件词汇 `TrackEvent`（kernel） | host | 宿主适配 | 讲授（录制与回放）、各插件（报告与重放自己的操作，7.2 节） |

## 4. 执行环境（M6，P-100 至 P-106）

### 4.1 领域

| 中文 | 标识符 | 含义 |
|---|---|---|
| 具名环境 | `EnvironmentSpec` | 文稿头部声明的一个运行环境：提供方类型（`kind`）、地址、可用语言、凭据方式、镜像摘要 |
| 环境提供方 | `EnvironmentProvider` | 按声明创建执行器的插件扩展点：`create(name, spec, ctx) → Executor` |
| 执行会话 | `RunRequest.session` | 共享解释器状态的一组运行，按页面与学习者隔离 |
| 富输出 | `RunOutput` | nbformat 输出：文本流、显示数据（按 MIME 类型）、错误 |

不变量有三条：

1. **不指定环境的代码块，路由与现在完全相同。**
2. **环境不可用时不悄悄换环境。** 环境的执行器缺凭据或不可达时返回失败，由 P-24 显示录制输出，不会改到别的执行器上运行。
3. **会话代码块的缓存键包含前序代码。** 同一会话中，一个代码块的编译时缓存键包含它前面所有代码块的代码，因为前面改一个变量，后面的输出就可能不同。

### 4.2 源语法与路由

```yaml
execute:
  env: browser                     # 有 :run: 而不写 :env: 的代码块的默认环境；省略时按现在的方式路由
  environments:
    gpu:  { kind: jupyter, url: https://gpu.example.edu/, kernel: python3, auth: proxy,
            image: quay.io/jupyter/pytorch-notebook@sha256:… }
    box:  { kind: devcontainer, path: . }      # 现有的本地容器执行（P-22），以名字引用
    c:    { kind: wasi }                        # 浏览器内 WASI（P-103）
```

````markdown
```{code} python
:run:
:env: gpu
:session: train
model = build_model()
```
````

编译器把 `:env: gpu` 写成 `run.executor = 'presmium.env.gpu'`。执行路由与 IR 运行时按已有的“指定执行器”逻辑工作，路由器不需要修改。每个提供方插件在 Node 端与浏览器端都为声明的环境注册执行器，环境指纹进入缓存键（K-19）：

| 提供方 | 指纹的组成 |
|---|---|
| Jupyter | 镜像摘要、内核规格哈希、内核报告的版本 |
| WASI | 运行时二进制的哈希 |
| WebGPU | 浏览器与显卡描述 |

`presmium check` 报告两类问题：代码块引用了未声明的环境；环境不可达（只在显式运行 `check --env` 时连接）。

### 4.3 后端

| 包 | 后端 | 浏览器端 | Node 端（编译时） | 要点 |
|---|---|---|---|---|
| `addon-exec`（已有） | Pyodide、JS/TS Worker | 已有 | 已有（python3、node） | 增加会话（Pyodide 解释器常驻）与富输出（matplotlib 图片）；增加 Python 的 WebGPU 桥 `presmium_gpu.py`（经 Pyodide 的 JS 桥调用 `navigator.gpu`） |
| `addon-exec-wasi`（新） | C、C++、Ruby、SQLite 等 WASI 程序 | 候选 Runno（MIT） | 同一份 WASI 二进制 | 运行时二进制随产物发布并离线缓存；编译时与浏览器同一份二进制，输出一致 |
| `addon-exec-webgpu`（新） | `wgsl` 计算着色器；JS/TS 中的 jax-js | 是 | 构建时用 Playwright Chromium（有 GPU 时用 Vulkan，CI 中用 SwiftShader）录制 | 限制规模，超时就销毁设备并结束 Worker；不可用时按原因回退到录制输出；计时注明是否为 CPU 模拟 |
| `addon-exec-jupyter`（新） | 任何 Jupyter Server | `@jupyterlab/services` | 同一个库 | 覆盖 compose、JupyterHub、Binder、agent-sandbox、托管 Jupyter；不为单个平台写插件 |

各后端的补充说明：

- **WebGPU**：
  - 学习者自己写的 kernel 和张量代码，只用 jax-js 与原生 WGSL。
  - ONNX Runtime Web、transformers.js 只用于推理演示，按需懒加载。
  - 不依赖已停更的 TensorFlow.js WebGPU 后端和 webgpu-torch。
  - 不要求页面设置 COOP/COEP 响应头。
- **Jupyter 的服务端用原版 `jupyter_server`**，凭据有四种方式：
  - `env`：构建机的环境变量，用于编译时。
  - `proxy`：服务端代理代为加上凭据，浏览器拿不到。
  - `prompt`：学习者粘贴自己的令牌，用于已发布的静态站点。
  - `hub`：以后由课堂服务充当 JupyterHub 的 OAuth 客户端。
- **远端返回的 HTML 不可信**，放进沙箱 iframe，或先清洗再显示。

### 4.4 部署模板（P-106）

部署模板分三档：

- **随仓库维护**，有端到端冒烟测试，放在 `templates/env/compose/`：
  - `compose.yaml`：用固定摘要的 docker-stacks 镜像，或文稿自己的 Dockerfile；设置令牌、允许的来源、空闲回收、资源限制。
  - `compose.gpu.yaml`、`compose.gvisor.yaml`：GPU 和 gVisor 的覆盖配置。
  - `devcontainer.json`：指向 compose，所以同一份定义可以同时用于本地容器（P-22）和环境复刻（P-26）。
- **只给文档**，不维护清单文件：Kubernetes 的 Zero to JupyterHub `values.yaml` 片段（按 CPU、GPU、MIG 划分的配置，gVisor 的 `runtimeClassName`，回收设置），以及 agent-sandbox 的模板。
- **留给用户**：集群搭建、GPU Operator、gVisor/Kata 的安装、入口与证书、身份提供方。

GPU 隔离的建议：要隔离，用 gVisor 的 `nvproxy`；人多卡少，用 MIG 切分的普通容器，或者只让主讲现场运行，学习者看录制输出。避免引入 AGPL 许可的沙箱平台。

### 4.5 富输出的渲染

| 渲染端 | 处理方式 |
|---|---|
| 网页、幻灯片 | 按 MIME 类型选择渲染器：`image/*`、`text/markdown`、`text/plain`、`application/json`、`text/html`（沙箱）、`text/latex`；ANSI 回溯转换为样式；插件可以为新的 MIME 类型注册渲染器（`registerNodeRenderer('mime:<类型>')`） |
| notebook | 把输出原样写入单元格的 `outputs` |
| 静态导出 | 使用录制输出 |

## 5. 智能体（M7，P-110 至 P-115）

### 5.1 领域

| 中文 | 标识符 | 含义 |
|---|---|---|
| agent 环境 | `@presmium/mcp` 的服务器 | 以 MCP 工具暴露文稿：读取类与操作类 |
| agent 运行时 | `AgentRuntime` | 驱动一个 agent 的适配：`open`、`prompt → AsyncIterable<AgentEvent>`、`cancel`、`close`、`onPermission`；唯一实现是 ACP 客户端 |
| 任务 | `AgentTask` | 一次交给 agent 的工作：问答、一批批注、一轮对话；带上下文（文稿、章节、步骤、选中内容、源码位置） |
| 批注 | `Annotation` | 目标（章节 ID、块 ID、源码文件与行区间、摘录）与要求；状态：草稿、已发送、已处理、未能处理 |
| 操作确认 | `Approval` | 操作类工具与 agent 自身权限请求的确认：关闭、询问（默认）、允许 |

不变量：

- **只写源码，不碰产物**：agent 只修改源码；修改范围限于工作区，超出当前文档目录时需要确认。
- **一文档一任务**：同一文档同一时间只有一个修改任务。
- **每批一提交**：任务结束时，修改由工作区提交为一个提交（`REVISIONS`）。
- **学习者只读**：学习者的问题不触发任何写入或操作类工具。

### 5.2 MCP 服务（`packages/mcp`，P-110）

- **运行位置**：服务运行在 `presmium dev` 或 `presmium serve` 进程内，地址是 `http://127.0.0.1:<端口>/mcp`。它校验 Host 与 Origin，并要求每个进程独有的令牌。`presmium mcp` 以 stdio 方式提供同样的工具，Claude Code、Codex、VS Code 等编辑器里的 agent 也能直接使用。
- **只提供工具**：DeepSeek Harness 只读取 MCP 工具，不读取资源，也不接收通知，所以一切能力都做成工具。放映位置由 agent 用 `get_position` 主动查询。为支持资源的宿主另外提供只读资源。

| 工具 | 类别 | 返回或作用 |
|---|---|---|
| `list_documents`、`deck_info`、`list_sections` | 读取 | 工作区文档、文稿概况、章节与步骤数、源码位置 |
| `get_section`、`get_step` | 读取 | 讲解、每一步的上屏内容、代码引用、媒介限定 |
| `search` | 读取 | 与网页搜索相同的索引（P-71） |
| `get_code_ref`、`get_outputs`、`get_diagnostics` | 读取 | 代码引用及其锚点状态、录制输出、检查结果 |
| `locate_source` | 读取 | 章节、步骤、块或锚点对应的源码文件与行区间 |
| `get_position`、`get_classroom` | 读取 | 主讲的放映位置；课堂的汇总数据（不含学习者身份） |
| `navigate`、`run_code`、`build`、`classroom_start`、`classroom_end` | 操作 | 需要确认（`Approval`），确认的关口设在我们自己的服务里，换用其他运行时同样生效 |

MCP 服务不提供写文件的工具：agent 用它自己的文件工具修改源码，`presmium dev` 随即重新编译并推送。学习者会话连接 `/mcp?role=learner`，只看得到读取类工具。

### 5.3 agent 运行时（`addon-assistant` 的 Node 端，P-111）

ACP 客户端基于 `@agentclientprotocol/sdk`（Apache-2.0），启动配置中的命令，默认是 `dsh --profile presmium --patch <模板>`。

- **会话**：每个会话发一次 `session/new`，`cwd` 设为工作区根目录，`mcpServers` 指向本进程的 MCP 服务并带上令牌。
- **权限请求**：agent 自身的权限请求（`session/request_permission`）转给页面上的确认界面。
- **可替换**：换成 Claude Agent SDK、Gemini、Codex 的 ACP 适配，只需改命令。

我们随包提供 DeepSeek Harness 的配置模板，不写 dsh 插件，共两份：

| 模板 | 用途 | 设置 |
|---|---|---|
| `presmium` | 作者 | 关闭会话日志上传与遥测；沙箱为 `workspace-write`，权限策略为询问 |
| `presmium-tutor` | 学习者问答 | 不提供 shell、网络与写文件工具；只读 |

模板覆盖的配置项 ID 在 dsh 文档里没有写，由一个集成测试对固定版本运行 `--dump-config` 来校验。

页面与 agent 之间走服务端路由：

- `POST /__presmium/assistant/tasks` 提交任务；
- `GET .../tasks/<id>/events` 以 SSE 接收进度、回答与确认请求；
- `POST .../tasks/<id>/cancel` 取消任务。

ACP 不逐字流式输出，所以回答按条显示，工具调用过程作为进度显示。

### 5.4 三种使用方式（P-112 至 P-114）

| 方式 | 入口 | 上下文 | 写入 |
|---|---|---|---|
| 学习者问答 | 网页阅读侧栏；放映时的演讲者面板 | 当前章节、步骤、选中内容 | 无；回答带可点击的引用位置 |
| 批注修改 | 编辑模式中点选块（`.pm-block[data-block]`），IR 中块的 `source` 给出文件与行区间 | 每条批注的源码位置、摘录与要求 | 有；一批一提交 |
| 对话修改 | 编辑模式的对话面板 | 当前文档、章节、步骤、选中内容 | 有；一轮一提交 |

学习者问答在三种部署下各有一条路，学习者都不直接接触作者的 agent：

- **工作区服务部署**：学习者登录后使用 `presmium-tutor` 运行时。
- **静态站点配合课堂**：学习者的提问（P-66）经课堂通道到达演讲者窗口，主讲确认后由本机的 agent 回答，回答回到课堂。
- **纯静态站点**：不提供问答。

### 5.5 修改历史（P-115）

工作区服务把一个任务的修改提交为一个提交（`simple-git`）：

- **提交说明**：列出批注或对话摘要，以及 agent 的解释。
- **尾注**：带上 `Presmium-Task: <id>` 与发起人。
- **作者字段**：来自登录身份。

页面上的修改历史按尾注筛选。撤销就是 `git revert`；遇到冲突时报告冲突的文件，不强行撤销。

## 6. 工作区（M7，P-120 至 P-122）

### 6.1 领域

| 中文 | 标识符 | 含义 |
|---|---|---|
| 工作区 | `Workspace` | 一个 git 仓库，包含多份文档；根目录的 `presmium.workspace.yaml` 声明文档的位置（默认 `*/lecture.md`）与站点设置 |
| 文档 | `Document` | 一份文稿：目录、入口文件、标题、语言、标签，取自它的头部 |
| 修改 | `Revision` | 一个提交及其来源（agent 任务、文档操作、作者在编辑器中的提交） |
| 成员 | `Member` | 登录身份与角色：读者、编辑者、所有者，来自登录代理或工作区配置 |

不变量：

- **文档的身份是目录**：重命名就是移动目录，同时更新链接与锚点锁文件。
- **文档操作即提交**：新建、复制、删除都是对源码目录的修改，并形成提交。
- **编辑按角色**：只有编辑者和所有者能进入编辑模式。

### 6.2 站点与服务

- **工作区站点**：网页渲染端增加工作区站点（P-122）。首页是文档列表，有搜索和标签；每份文档挂在 `/<文档目录>/` 下，内部仍按章分页。`presmium build` 在工作区根目录执行时构建整个站点，在文档目录执行时只构建那一份。VitePress 仍然只由 `web` 使用。
- **`presmium serve`**：由 `packages/workspace` 提供，就是开发模式下的工作区站点，再加三样东西：
  - 编辑模式：工作区的浏览器插件，提供进入编辑、文档操作、修改历史；批注与对话由助手插件提供。
  - 文档管理接口：`/__presmium/workspace/documents`，以及修改历史接口。
  - 各插件的服务端贡献：环境代理、语音、助手、MCP。

  多份文档按需编译：只编译正在被访问的文档，并监听它的源码；其余文档只读取头部，用于列表。
- **从模板新建文档**：模板放在 `templates/document/`。也可以由 agent 起草，相当于一轮对话修改。

## 7. 讲授（M8，P-90、P-130 至 P-136）

### 7.1 领域与格式

| 中文 | 标识符 | 含义 |
|---|---|---|
| 讲授轨 | `LectureTrack` | 一堂讲授：语音段、事件、音频片段、块指纹与 IR 哈希，存为 `lectures/<id>/track.json` |
| 语音段 | `Utterance` | 一句话：开始时间、时长、文字、逐字（中文）或逐词时间、所在章节与步骤 |
| 事件 | `TrackEvent` | `[t, type, data]`（毫秒），类型以插件 ID 或内置名开头；不认识的类型忽略 |
| 时钟 | `TrackClock` | `now`、`play`、`pause`、`seek`、`rate`；录制的讲授用媒体元素（`MediaClock`），合成的讲授用按已知偏移排列的片段（`ClipClock`），只有字幕时用 `SilentClock` |
| 音色 | `Voice` | 录制（说话人）或合成（引擎、模型、音色）；克隆音色带同意记录 |

格式借鉴 asciinema 的 asciicast（事件为元组，不认识的类型忽略），时间用绝对毫秒，便于跳转与编辑：

```json
{ "track": 1, "id": "bpe-2026-10-16", "doc": "lecture.md", "lang": "zh-CN", "ir": { "hash": "…" },
  "voice": { "kind": "recorded", "speaker": "张老师" },
  "audio": [{ "section": "merge", "start": 0, "src": "audio/merge.ogg", "duration": 312.4, "sha256": "…" }],
  "blocks": { "merge/code-1": { "fp": "…", "lines": 14 } },
  "utterances": [{ "id": "u12", "t": 81200, "d": 5400, "text": "我们先看这三行", "words": [[81200, 210, "我"]], "section": "merge", "step": 2 }],
  "events": [[81000, "go", { "section": "merge", "step": 2, "view": "present" }],
             [82100, "spot", { "block": "merge/code-1", "lines": "3-5", "at": ["u12", 4] }],
             [82300, "point", { "block": "merge/code-1", "path": [[0, 0.31, 0.42], [40, 0.33, 0.44]] }],
             [90500, "run", { "block": "merge/code-1", "result": "freeze:ab12" }]] }
```

- **事件类型**：`go`（章节、步骤、视图）、`point`（以块为参照的路径，代码块用行）、`spot` 与 `hint`、`ink`、`select`、`click`（组件的具名动作，不是原始 DOM 点击）、`run`（录制的运行结果，回放时默认重放）、`scroll`、`mark`（章节标记）、`pause`。
- **`at: [语音段, 字偏移]`** 把事件绑定到文字。换音色或重新合成某一段时，按新的逐字时间重新计算事件时刻，这就是“改文字、换音色、操作跟着走”的机制。
- **导出**：`captions.<语言>.vtt`、`chapters.vtt`、`events.vtt`（元数据），只作为导出格式，不作为主存储。

不变量：讲授轨以文字为主存储；事件只引用章节、块（带内容指纹）与锚点，不引用像素；时刻 t 的画面是 t 之前事件的折叠 `state(t) = fold(events ≤ t)`，跳转精确且可逆。

### 7.2 录制与回放（`addon-lecture`，P-90、P-130、P-131）

宿主新增 `OPERATIONS` 服务：插件用 `report(event)` 报告自己的操作，用 `onReplay(type, apply)` 注册重放；宿主适配自己报告 `go`。事件词汇是内核中的共享契约 `TrackEvent`，插件之间不互相引用。引导插件报告聚光与提示，执行插件报告运行，讲授插件自己报告指针（`elementFromPoint` → 最近的 `[data-block]` → 块内相对坐标，约 20 Hz，简化后保存）与工具栏的激光笔、荧光笔。

- **录制**：放映视图中录音（`getUserMedia`，开启回声消除与降噪），经 Mediabunny（MPL-2.0）的 WebCodecs 路径录为 Ogg/Opus，各浏览器一致、可跳转；每 5 秒一块上传到 `/__presmium/lecture/<id>`；时钟为 `performance.now() - t0` 减去暂停。摄像头与屏幕可选。停止后可选转写（P-132），得到语音段、`at` 绑定与 VTT 导出。可以只重录某一节。
- **存储**：`track.json` 随文稿提交；录制的音频默认不提交（git LFS 或外部地址可选，按工作区配置）。
- **回放**：IR 运行时中的视图 `lecture`（网页形态先做）。`TrackClock` 为时钟，播放时每帧、跳转后立即按 `state(t)` 经宿主服务应用：导航、引导的渲染、执行结果重放。界面：逐字稿（点字跳转）、章节、字幕、倍速、“我来试试”（暂停后自行操作或运行，回到讲授时还原 `state(t)`）、AI 语音标识。
- **漂移检查**：`presmium check` 的 `presmium.lecture` 检查项按块指纹与 IR 哈希报告移动、失效的块与变化的步骤数（分级同锚点：exact、moved、fuzzy、lost）；回放时丢弃失效的事件并提示。需要长期回放的块建议写标签，因为生成的 `<kind>-<n>` ID 会随插入而移动。

### 7.3 脚本化讲授（P-134）

讲解就是脚本，不需要另写文件。讲解本来就逐段绑定到步骤（`ir.md` 2.4 节），新增的渲染端 `lecture`（K-18，由 `addon-lecture` 提供）把 IR 编译为讲授计划：每一步要说的文字与提示标记。

```markdown
我们先看 {cue to=code-1 lines=3-5}`spot` 这三行：每一轮找出现次数最多的字节对，{cue}`next` 再把它合并成新符号。
运行一下 {cue to=code-1}`run` 看看结果。{say alias="B P E"}`BPE` 的词表就这样一步步长出来。{cue}`pause 800ms`
```

- **`{cue}`**：`next`（在此处推进一步，而不是在段落末尾）、`spot`、`hint`、`point`、`click`、`run`、`ink`、`pause <时长>`、`mark <名称>`；目标是块标签（`to=code-1`），可加 `lines=` 或 `sel=`。
- **`{say alias=…}`**：显示内容、读出别名；文稿头部的读音词典送给引擎（火山引擎的 `pronunciation_dict`）。
- **时间**：提示标记在它所在字的时刻触发：优先用引擎返回的逐字或逐词时间；没有时把合成音频转写一遍对齐；再不行按字数线性估算。一步在其讲解说完后 0.5 秒推进，或在 `{cue}`next`` 处推进；`run` 重放冻结的录制输出（K-19）。
- **渲染**：网页、幻灯片与 notebook 只显示 `{cue}` 的子内容（通常为空）；编辑模式与演讲者备注中显示一个标记。
- **产物**：与录制的讲授相同的 `track.json`（`voice.kind: synthetic`）与音频片段，写入 `dist/`，静态站点离线可放、不需要密钥。
- **agent 撰写讲授**：在源码中写讲解与 `{cue}`、`{say}`，走批注与对话的提交流程（P-113、P-114）；MCP 增加 `lecture_preview`、`lecture_synthesize`（花钱，需要确认）与 `track_transcribe` 工具。

### 7.4 语音服务（`addon-speech`，P-132、P-133）

语音使用商业服务。和远端执行用 Jupyter 协议一样，Presmium 与语音之间只有一种协议：OpenAI 音频接口的形态，由语音网关实现，只有网关接触服务提供方。

- **协议**：`POST {base}/audio/transcriptions`（`verbose_json`，逐词时间）；`POST {base}/audio/speech`；扩展 `POST {base}/audio/speech/timestamps`，返回 `{ audio, format, duration, words[] }`，因为托管的合成接口都不返回逐词时间。各适配器把各家的时间单位统一为秒。
- **网关**：在 `presmium dev` 与工作区服务中，地址 `/__presmium/speech/v1`；`presmium build` 在进程内调用；也可以单独作为一个小代理运行。密钥只来自环境变量；文稿只写引擎与音色的名字。火山引擎的跨域规则不允许浏览器携带 API Key，也没有短期令牌，所以必须经网关。
- **服务契约**（kernel，`SPEECH`）：

```ts
interface SpeechWord { text: string, start: number, end: number }          // 秒；中文为单字
interface Synthesis { audio: Blob | string, mime: string, duration: number, words?: SpeechWord[],
  key: string, engine: string, model: string, voice: string, synthetic: true }
interface Transcript { lang: string, duration: number, text: string,
  segments: { start: number, end: number, text: string, words: SpeechWord[] }[] }
interface SpeechService {
  engines(): { id: string, stt: boolean, tts: boolean, wordTimes: boolean, local: boolean }[]
  voices(engine: string, lang?: Locale): Promise<{ id: string, label: string, lang: string[], cloned?: boolean }[]>
  synthesize(req: { engine?: string, voice: string, text: string, lang: Locale, rate?: number, style?: string,
    lexicon?: Record<string, string> }, signal?: AbortSignal): Promise<Synthesis>
  transcribe(req: { engine?: string, audio: Blob, lang?: Locale, hints?: string[] }, signal?: AbortSignal): Promise<Transcript>
}
```

- **引擎**：

| 引擎 | 用途 | 要点 |
|---|---|---|
| `volcengine` | 默认的生产引擎 | 合成用 `seed-tts-2.0` 的 HTTP 分块接口并开启 `enable_subtitle`，得到逐字时间；开启 SSML、公式规整或服务端缓存时时间戳会消失，因此不用；没有 SSML 标记点，提示标记按字偏移映射。转写：本地工作区用极速版（直接上传音频）；有对象存储时用录音文件识别 2.0（逐字毫秒时间）；现场字幕用流式识别 2.0。中英混说的效果要用测试讲义验证 |
| `openai-compatible` | 按地址接入 | Groq（免费转写，每天 8 小时，带逐词时间）、OpenAI、自建的 Speaches、Kokoro-FastAPI 等 |
| `azure` | 可选 | 免费档的合成支持书签与中文词边界，适合开发时测试合成 |
| `fake` | CI | 真实的 HTTP 服务，同一协议；逐字时间确定（中文每字 220 ms 等），合成的音频中嵌入文字，合成再转写可以精确往返 |
| `webspeech` | 浏览器预览 | 不能导出音频，只用于编辑时试听 |

- **合成缓存**（原则 5）：键是规范化的（引擎、模型、音色、语言、语速、风格、读音词典哈希、要说的文字）的 sha256；文件为 `.presmium/speech/<键>.ogg` 与 `<键>.json`（逐字时间、时长、引擎信息、AI 生成标识），`speech.lock` 列出文稿用到的键与音频哈希。缓存随文稿提交（Opus 约 24 kbps，一小时约 11 MB）或用 LFS。构建只读缓存；缓存缺失又没有密钥时，`presmium check` 报错并指出是哪些段落。改一段只重新合成一段。

### 7.5 导出视频与转写回写

- **导出视频（P-135）**：Playwright 播放讲授并逐帧截取或录屏，用 Mediabunny 与音频合成为视频文件；命令行工具，不进入浏览器产物。不用 ffmpeg.wasm（核心为 GPL）、Remotion（超过 3 人的公司需要商业许可）与 Motion Canvas（2024 年底起停止维护）。
- **转写回写讲义（P-136）**：录制讲授的转写作为一个 agent 任务：agent 把整理后的逐字稿写成讲解，并在 `at` 绑定的位置写入 `{cue}`，形成一个提交（5.5 节）。

### 7.6 合规

- 克隆音色默认关闭，必须有本人录制的同意声明（火山引擎协议 4.1.4 条；《互联网信息服务深度合成管理规定》第十四条）。火山引擎的克隆协议允许其使用声音数据并在终止后保留 3 个月，启用前需要法务确认。
- 合成的语音在播放界面上显示“AI 合成语音”，并按 GB 45438-2025 写入元数据（国内自 2025-09-01 起，欧盟自 2026-08-02 起要求标识）。
- 录音默认只保存在本地，只有对某一段讲授显式执行“转写”时才发给语音服务，界面标明服务提供方。

## 8. 服务端与部署（N-08、N-09）

### 8.1 进程

| 进程 | 作用 | 何时需要 |
|---|---|---|
| `presmium serve` 或 `presmium dev` | 编译、实时推送、插件的服务端贡献、MCP、agent 适配、修改提交 | 编辑、agent、远端环境的代理模式、语音 |
| DeepSeek Harness（子进程） | agent | 使用 agent 时 |
| 课堂服务 | 课堂同步（P-61） | 开课时 |
| Jupyter Server（容器或集群） | 远端执行 | 使用远端环境时 |

### 8.2 登录与权限

- **默认只监听本机**：本机使用时不需要登录。
- **部署时登录**：放在登录代理（例如 oauth2-proxy）之后，由代理完成认证，再以请求头传来身份。工作区服务只信任来自代理的请求，用共享密钥或固定的来源地址确认。
- **角色**：读者只能阅读和提问；编辑者可以进入编辑模式、修改与撤销；所有者额外负责工作区设置。角色来自代理传来的组，或 `presmium.workspace.yaml`。

### 8.3 部署模板

`templates/workspace/compose/`：

- `compose.yaml`：工作区服务、oauth2-proxy、课堂服务，以及可选的 Jupyter 环境，与 4.4 节共用同一套覆盖配置。
- 数据卷：工作区仓库。

Kubernetes 只给文档与示例清单片段，不维护 Helm chart。

## 9. 安全（N-08）

| 风险 | 措施 |
|---|---|
| agent 误改或越权 | 只写工作区；超出文档目录要确认；一批一提交，可撤销；操作类工具与 agent 的权限请求都要确认 |
| 提示注入（学习者问题、远端输出、网页内容） | 学习者会话只读、不能联网；回答在课堂中公开前可要求主讲确认 |
| 凭据泄露 | 凭据只在服务端；代理加凭据；`presmium check` 对文稿中像密钥的字段告警；启动 agent 子进程时传入清理过的环境变量 |
| 数据外发 | dsh 的会话日志上传与遥测由模板关闭；语音与模型的服务提供方在界面上标明，外发须显式开启 |
| 不可信的富输出 | 远端 HTML 在沙箱 iframe 中显示或先清洗 |
| GPU 被学习者代码拖垮 | 限制规模、超时销毁设备、可选只读录制 |
| 音色滥用 | 克隆默认关闭，需本人录制的同意声明；合成音频在界面与元数据中标明由 AI 生成（7.6 节） |

## 10. 测试策略

沿用“只写集成测试”（`architecture.md` 第 7 节）。外部服务一律用可替换的真实协议实现来测试，不 mock 宿主框架：

| 对象 | 测试方式 |
|---|---|
| 远端环境 | compose 模板起一个真实的 `jupyter_server`，浏览器与编译时都在其中运行代码；会话隔离用两个浏览器上下文验证 |
| WebGPU | 默认的无头 Chromium 没有 GPU 适配器，正好验证回退；加 SwiftShader 参数验证执行路径 |
| WASI | 真实运行时，断网验证离线 |
| agent | ACP 协议的确定性测试 agent（按脚本修改文件、调用 MCP 工具）驱动批注、对话、撤销的全流程；真实 DeepSeek Harness 的用例需要凭据，默认跳过；`--dump-config` 校验模板 |
| MCP | MCP SDK 的客户端连接服务，逐个调用工具 |
| 语音 | 确定性的假引擎（真实 HTTP 服务，同一协议）；火山引擎与 Groq 的冒烟用例在设置了密钥时运行 |
| 讲授 | 录制：Chromium 的假麦克风播放假引擎合成的音频（`--use-fake-device-for-media-stream`、`--use-file-for-fake-audio-capture`），讲授轨中有 `go` 与 `point`，回放到时刻 t 显示正确的章节与步骤；脚本化：用假引擎构建测试讲义，检查片段、VTT 与提示标记的时刻 |
| 工作区 | 真实 git 仓库：文档操作与撤销各形成正确的提交；登录用代理请求头模拟 |

## 11. 先行验证

以下几项在对应工作包开始时先做小规模实测，结论写回本文：

| 事项 | 工作包 |
|---|---|
| Runno 的运行时二进制能否自托管、离线加载，以及在 Node 中运行同一份二进制 | WP-74 |
| JSPI 在各浏览器中的可用性，决定 Python 的 WebGPU 桥是否提供同步写法 | WP-75 |
| Vite 代理能否在 WebSocket 升级时加凭据；浏览器访问 JupyterHub 用户服务器时的跨域；`runsc` 与 GPU 同时使用 | WP-76 |
| 录制文件在各浏览器中能否跳转；WebM 时长修正 | WP-77 |
| 火山引擎转写中英混说的效果；Safari 26 录制 Ogg/Opus；GB 45438 元数据字段在各容器中的写法；`@mediabunny/server` 附带的 FFmpeg 是 LGPL 还是 GPL | WP-77、WP-82、WP-83 |
| dsh 配置项 ID；dsh 在调用 MCP 工具前是否询问 | WP-80 |

## 12. 包与工作包

| 包 | 新建或修改 | 工作包 |
|---|---|---|
| `kernel`、`compiler`、`viewer`、`render-notebook`、`render-slides`、`addon-exec` | 修改：会话、富输出、`:env:`、首选执行器的统一（`review-round2.md` 决定 5）、Node 端服务注册、服务端贡献、行内角色扩展点、`lecture` 媒介 ID | WP-73 |
| `host` | 修改：`useServer`、`OPERATIONS` | WP-73（`useServer`）、WP-77（`OPERATIONS`） |
| `addon-exec-wasi` | 新建 | WP-74 |
| `addon-exec-webgpu`；`addon-exec` 的 Python 桥 | 新建、修改 | WP-75 |
| `addon-exec-jupyter`、`templates/env/` | 新建 | WP-76 |
| `addon-lecture`（讲授轨、录制、回放、`lecture` 渲染端、`{cue}`、`{say}`、导出视频） | 新建 | WP-77、WP-83 |
| `mcp`、`cli`（`presmium mcp`） | 新建、修改 | WP-78 |
| `workspace`、`web`（工作区站点）、`cli`（`presmium serve`）、`templates/workspace/`、`templates/document/` | 新建、修改 | WP-79 |
| `addon-assistant` | 新建 | WP-80、WP-81 |
| `addon-speech`（语音网关、引擎、合成缓存） | 新建 | WP-82 |
| `addon-lecture`（转写回写） | 修改 | WP-84 |

各工作包的文件归属与验收用例由 WP-72 写入 `wbs.md`；每个工作包同步更新受影响的技能（P-82）。
