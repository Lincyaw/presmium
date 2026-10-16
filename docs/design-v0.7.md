# v0.7 总体设计

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
- 讲解中的行内提示标记是 mdast 节点 `presmiumCue`：`{ type: 'presmiumCue', action, target, data? }`。它留在讲解块的 mdast 中；不认识它的渲染端忽略它，网页默认不显示（7.3 节）。

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
| `SPEECH`（浏览器）、`SPEECH_ENGINE`（Node） | kernel | 语音插件 | 讲授插件（录制转写、合成、构建时合成） |
| `AGENT`（浏览器）、`AGENT_RUNTIME`（Node） | kernel | 助手插件 | 工作区（文档起草）、讲授（转写回写，P-136） |
| `REVISIONS`（Node） | kernel | 工作区 | 助手（每批修改提交）、文档管理 |
| `OPERATIONS`（浏览器） | host | 宿主适配 | 讲授（录制与回放）、各插件（报告与重放自己的操作，7.2 节） |

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

### 7.1 领域

| 中文 | 标识符 | 含义 |
|---|---|---|
| 讲授轨 | `LectureTrack` | 一堂讲授的时间轴：语音段与操作，按时间排列；附带它所对应的文稿与 IR 哈希 |
| 语音段 | `SpeechSegment` | 一段话的文字、开始与结束时间、说话人、可选的音频与逐词时间 |
| 操作 | `Operation` | `{ t, type, key?, target, data }`：`type` 以插件 ID 开头；`target` 是章节、块或锚点；分为状态类（同一 `key` 以最新的为准，例如光标、聚光目标、打开的面板）与事件类（指针移动、点击，只在发生时刻附近显示） |
| 音色 | `Voice` | 语音引擎与音色 ID，以及克隆音色的同意记录 |
| 讲授脚本 | `LectureScript` | 纯文本写成的讲授：讲解文字与行内提示标记，或单独的脚本文件 |

不变量：

- **主存储是文字**：讲授轨的文字是主存储，音频可以按“文字＋音色”重新生成。
- **操作不用像素坐标**：操作只引用章节、块、锚点，以及块内的相对坐标。
- **跳转可还原**：跳到时刻 t，等于应用 t 之前每个 `key` 的最后一个状态类操作。由于组件状态是步骤的纯函数，跳转后可以完全还原画面。

### 7.2 录制与回放（`addon-lecture`，P-90、P-130、P-131）

宿主新增 `OPERATIONS` 服务。插件用 `report(op)` 报告自己的操作，用 `onReplay(type, handler)` 注册重放；宿主适配自己报告光标变化。各插件的分工：

| 插件 | 报告的操作 |
|---|---|
| 引导 | 聚光、提示 |
| 执行 | 运行 |
| 课堂 | 测验的打开与关闭 |
| 讲授 | 指针，以块为参照的相对坐标 |

**录制**：

- 在放映视图中录制，只录音频，摄像头和屏幕可选。用 MediaRecorder，按浏览器检测可用的格式。
- 录制时把操作写入讲授轨。
- 音频分片上传到服务端，存进文稿目录的 `lectures/<id>/`，包括 `track.yaml`、`audio.*`，以及导出的 `captions.vtt`、`chapters.vtt`。
- 音频较大，默认用 git LFS 管理或不提交，按工作区配置决定。

**回放**：回放是 IR 运行时中的一个视图 `lecture`。

- **时钟**：以音频元素为时钟。合成的讲授是一串音频片段，时间轴在合成时就已确定。
- **还原画面**：每帧按时刻还原光标与状态类操作，并在时刻附近显示事件类操作。
- **跳转**：可以按章节、步骤、句子跳转，支持倍速与字幕。
- **学习者介入**：学习者自己翻页时暂停回放，并提示“回到讲授”。

**检查**：`presmium check` 增加一项检查，报告讲授轨中已经失效的章节、块与锚点，原理与锚点漂移相同。

### 7.3 脚本化讲授（P-134）

讲解本来就逐段绑定到步骤（`ir.md` 2.4 节），所以一份讲义不加任何东西就能生成一堂讲授：

1. 每段讲解是一个语音段；
2. 讲解所属的步骤到达时，开始说这一段；
3. 讲解中的行内提示标记在说到该位置时触发。

提示标记用 MyST 行内角色写，例如：

```markdown
合并时我们找出现次数最多的一对，{cue}`spotlight merge-loop`就是这个循环，然后{cue}`run bpe-train`运行一次。
```

- **触发时刻**：由合成引擎返回的逐词时间（或标记点时间）确定；引擎不提供时，按字数比例估算。
- **单独的讲授脚本**：`lectures/<名>.md` 使用同样的角色，并可以重新安排顺序与停顿，适合 agent 生成整堂课（P-110、P-111）。
- **构建时合成**：构建时由语音服务合成，结果按“文字、音色、引擎版本”的哈希缓存在 `.presmium/speech/`。所以静态站点可以离线回放合成好的讲授，构建结果也可复现（K-13）。

### 7.4 语音服务（`addon-speech`，P-132、P-133）

```ts
interface SpeechEngine {            // Node 端（SPEECH_ENGINE）
  id: string
  synthesize(req: { text: string, voice: string, lang: string, format?: string }): Promise<{ audio: Uint8Array, mime: string, words?: WordTime[] }>
  transcribe(req: { audio: Uint8Array, mime: string, lang?: string }): Promise<{ segments: { text: string, start: number, end: number, words?: WordTime[] }[] }>
  voices?(): Promise<VoiceInfo[]>
}
```

**引擎**：语音使用商业服务。

| 引擎 | 用途 | 状态 |
|---|---|---|
| 火山引擎 | 默认的生产引擎 | 接口细节待调研结论 |
| 一个免费服务 | 开发与测试 | 待调研结论 |
| 确定性的假引擎 | CI | 合成时按字数生成定长静音与逐词时间；转写时返回测试夹具中的文字 |

**调用方式**：浏览器通过服务端路由 `/__presmium/speech/*` 调用，凭据只在服务端。构建时直接调用引擎。

**数据使用**：录音与转写要发给第三方服务时，界面须标明服务提供方，并在配置中显式开启（N-08）。

**音色**：克隆音色需要本人同意；同意记录随音色保存，合成的音频在元数据和播放界面中标明由 AI 生成。

### 7.5 导出视频与转写回写

- **导出视频（P-135）**：用 Playwright 播放讲授并录制页面，再与音频合成为视频文件。这是离线的命令行工具，不进入浏览器产物。
- **转写回写讲义（P-136）**：录制讲授的转写作为一个 agent 任务提交，由 agent 按章节整理为讲解写回源码，并形成一个提交（5.5 节）。

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
| 音色滥用 | 克隆需本人同意；合成音频标明由 AI 生成 |

## 10. 测试策略

沿用“只写集成测试”（`architecture.md` 第 7 节）。外部服务一律用可替换的真实协议实现来测试，不 mock 宿主框架：

| 对象 | 测试方式 |
|---|---|
| 远端环境 | compose 模板起一个真实的 `jupyter_server`，浏览器与编译时都在其中运行代码；会话隔离用两个浏览器上下文验证 |
| WebGPU | 默认的无头 Chromium 没有 GPU 适配器，正好验证回退；加 SwiftShader 参数验证执行路径 |
| WASI | 真实运行时，断网验证离线 |
| agent | ACP 协议的确定性测试 agent（按脚本修改文件、调用 MCP 工具）驱动批注、对话、撤销的全流程；真实 DeepSeek Harness 的用例需要凭据，默认跳过；`--dump-config` 校验模板 |
| MCP | MCP SDK 的客户端连接服务，逐个调用工具 |
| 语音 | 确定性的假引擎；真实引擎的用例需要凭据，默认跳过 |
| 讲授 | 用假引擎合成一份测试讲义的讲授，在另一窗口尺寸中回放并按句子跳转；录制用 Chromium 的假媒体设备（`--use-fake-device-for-media-stream`） |
| 工作区 | 真实 git 仓库：文档操作与撤销各形成正确的提交；登录用代理请求头模拟 |

## 11. 先行验证

以下几项在对应工作包开始时先做小规模实测，结论写回本文：

| 事项 | 工作包 |
|---|---|
| Runno 的运行时二进制能否自托管、离线加载，以及在 Node 中运行同一份二进制 | WP-74 |
| JSPI 在各浏览器中的可用性，决定 Python 的 WebGPU 桥是否提供同步写法 | WP-75 |
| Vite 代理能否在 WebSocket 升级时加凭据；浏览器访问 JupyterHub 用户服务器时的跨域；`runsc` 与 GPU 同时使用 | WP-76 |
| 录制文件在各浏览器中能否跳转；WebM 时长修正 | WP-77 |
| 火山引擎合成的逐词时间、转写的时间戳、浏览器能否直连（不能则经代理） | WP-82 |
| dsh 配置项 ID；dsh 在调用 MCP 工具前是否询问 | WP-80 |

## 12. 包与工作包

| 包 | 新建或修改 | 工作包 |
|---|---|---|
| `kernel`、`compiler`、`viewer`、`render-notebook`、`render-slides`、`addon-exec` | 修改：会话、富输出、`:env:`、Node 端服务注册、服务端贡献 | WP-73 |
| `host` | 修改：`useServer`、`OPERATIONS` | WP-73（`useServer`）、WP-77（`OPERATIONS`） |
| `addon-exec-wasi` | 新建 | WP-74 |
| `addon-exec-webgpu`；`addon-exec` 的 Python 桥 | 新建、修改 | WP-75 |
| `addon-exec-jupyter`、`templates/env/` | 新建 | WP-76 |
| `addon-lecture` | 新建 | WP-77、WP-83 |
| `mcp`、`cli`（`presmium mcp`） | 新建、修改 | WP-78 |
| `workspace`、`web`（工作区站点）、`cli`（`presmium serve`）、`templates/workspace/`、`templates/document/` | 新建、修改 | WP-79 |
| `addon-assistant` | 新建 | WP-80、WP-81 |
| `addon-speech` | 新建 | WP-82 |
| `addon-lecture`（转写回写） | 修改 | WP-84 |

各工作包的文件归属与验收用例由 WP-72 写入 `wbs.md`；每个工作包同步更新受影响的技能（P-82）。
