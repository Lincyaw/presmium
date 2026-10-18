# v0.7 总体设计

> **v0.9 的说明（决定 E-8）**：本文中共享部署（SHARED 模式：登录代理、成员与角色、gateway、agent-host、compose 与 Kubernetes 的工作区布局、所有者控制台、编译确认、读取范围）与服务端读者问答（`question` 任务与 `tutor` 运行时在服务端回答读者）的设计在 v0.9 作废：工作区服务只供运行它的那个用户在本机使用（`presmium serve --host` 可在局域网中的其他设备上使用），读者问答改在浏览器中由读者自己填写的模型服务完成。见 `requirements.md` 的“定位与边界”与附录 B“v0.9 相对 v0.8”。本文正文不改写，保留为当时的记录。
>
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
> 12. **运营者设置与 MCP 访问**（3.3、3.4 节）：本文没有说插件怎样拿到不来自文稿的设置与 MCP 令牌。定稿增加 `ServerContext.settings`、`NodeServiceContext.settings`（工作区配置 `settings.<插件 ID>`，进程启动时读取一次），以及服务端提供的 `MCP_ENDPOINT`（为每个 agent 会话签发绑定成员与模式的令牌）和 `AgentSessionOptions.mcp`；工作区配置中原来的 `assistant`、`lectures` 移到 `settings` 之下。`@presmium/mcp` 声明自己的 `McpHost`，由服务端实现，依赖只有 `server → mcp` 一个方向。
> 13. **凭据与地址成对**（7.4、9 节）：本文说文稿只写引擎与音色的名字；定稿把它推广为“文稿不决定凭据发往哪里”：语音引擎的地址与凭据都由运营者在环境变量 `PRESMIUM_SPEECH_<ID>_URL`、`PRESMIUM_SPEECH_<ID>_KEY` 中定义（WP-72 初稿中文稿可写的 `url`、`keyEnv` 已去掉），远端环境的令牌只发往 `PRESMIUM_ENV_<名>_URL`，文稿的地址与它不同源时不连接，也没有 `JUPYTER_TOKEN` 这类通用的后备变量。否则编辑文稿的人或受提示注入的 agent 可以把服务端的密钥引向自己的地址。
> 14. **agent 必须显式启用**（5.3 节；“给出命令”由第 27 条改为“配置模型访问”）：本文默认启动 `dsh --profile presmium`；定稿要求运营者给出命令（`PRESMIUM_AGENT_COMMAND` 或 `settings.presmium.assistant.command`），没有时助手不可用，问题与源码不发给任何模型（N-08 的“须在配置中显式开启”）。随包的 DeepSeek Harness 模板仍是推荐的写法；界面标明模型的服务提供方（`AgentClient.provider()`）。
> 15. **构建与合成缓存**（7.4 节）：本文的“构建只读缓存”指已缓存的段落从不重新合成。定稿写明构建只为缺失的段落调用引擎并写入缓存（同编译时执行的录制），全部命中时不发请求，缺失又没有可用的引擎时报错。
> 16. **克隆音色的关口**（7.6 节）：由语音服务在合成前检查同意记录（Node 端与网关同一处），另需运营者设置 `settings.presmium.speech.cloned: true`；同意记录的位置见第 19 条（WP-72 第二稿曾放在文稿的 `.presmium/speech/consent/` 中）。`azure` 引擎不在本期范围，以后作为新的适配器加入。
>
> 以下各条是 WP-72 设计评审中验收者的决定（D1 至 D10）：
>
> 17. **编译时执行的信任模型**（D1；9 节只清理了 agent 子进程的环境；（b）由第 29 条改为只在 SHARED 模式中，沙箱环境由 sandbox 容器代替）：文稿的编辑者与受提示注入的 agent 不受信任，而编译时执行的正是他们写的代码。（a）每个 Node 端执行器（执行插件的子进程、本地环境插件的容器、WASI 与 Jupyter 的编译时客户端）只给代码编译器给出的 `RunContext.env`：`presmium build`、`dev` 中是进程的环境去掉全部 `PRESMIUM_` 开头与名字以 `_KEY`、`_TOKEN`、`_SECRET`、`_PASSWORD` 结尾的变量，`presmium serve` 中只有允许列表（`PATH`、每个工作区一个临时目录的 `HOME`、`LANG` 与 `LC_*`、`TZ`、`TMPDIR`），都加上运营者设置 `settings.presmium.exec.passEnv`。本地容器的 `docker` 与 devcontainer 命令行另得到 Docker 客户端需要的几个变量（`DOCKER_HOST`、`XDG_RUNTIME_DIR` 等与真实的 `HOME`，都不是凭据），容器里的代码经命令行只得到 `RunContext.env` 中的变量，rootless Docker 与 Docker 上下文因此不必经 `passEnv` 传入；WebGPU 录制所启动的 Chromium 同样只得到 `RunContext.env`。这也修正现有代码（`packages/addon-exec/src/node/child.ts` 把 `process.env` 整个传给子进程），由 WP-73b 实现并以拒绝用例验收。（b）`presmium serve` 中没有录制的代码只在所有者的 `operate` 确认后执行，除非 `settings.presmium.exec.compile` 为 `trusted`（另有默认的 `approve` 与 `off`；`off` 不执行、不记录，显示录制输出或降级内容）；一份文档至多一个待回答的编译确认，被拒绝或超时的代码不再自动请求，直到代码改动或编辑者再次请求，读者的访问不发出确认。配置了 `settings.presmium.exec.sandbox: <环境名>`（例如 compose 的 gVisor Jupyter 环境）时，`serve` 把原本在主机上运行的这些代码改在沙箱中运行；沙箱的内核不支持的语言不执行，`trusted` 时也不退回主机（WP-72 第二稿的 10.6 节曾让这类语言在主机上运行，与本条矛盾，已去掉）。MCP 的 `run_code` 与 `build` 也在服务端执行代码，使用同一套执行选项：`approve` 时 `run_code` 的确认是 `workspace` 范围（只有所有者能回答），`off` 时不提供 `run_code`，否则编辑者可以经自己的 agent 调用 `run_code` 并自己确认，绕过所有者与沙箱（WP-78）。契约增加 `RunContext` 与 `Executor.run` 的第三个可选参数（`architecture.md` 4.6、10.6 节；WP-73b、WP-79）。
> 18. **确认按范围分发**（D2）：确认分为 `content`（任务的文档目录中的文件，发给发起任务的编辑者或所有者）与 `workspace`（`presmium.workspace.yaml`、成员、确认策略、运营者设置、同意记录、文档目录之外的任何路径、agent 的 shell 与网络权限请求，只发给所有者）。编辑者不能批准自己的 agent 的工作区范围请求。MCP 的操作类与计费类工具属于 `content`，发给令牌所绑定的成员；例外是 `presmium serve` 中 `compile: approve` 时的 `run_code`，它属于 `workspace`（第 17 条）。契约增加 `ApprovalScope` 与 `ApprovalRequest.scope`（默认 `workspace`）；拒绝用例在 WP-81。
> 19. **同意记录由运营者保管**（D3；签名与任务结束时的复原由第 30、35 条去掉；默认目录由第 39 条移到工作区之外；本条“agent 与被执行的代码拿不到密钥”的理由也不成立，同一 uid 的代码能读服务进程的环境，见第 34 条）：同意记录不在文稿中，而在运营者控制的目录 `settings.presmium.speech.consentDir`（默认 `<工作区>/.presmium-operator/consent/`）：只由所有者经服务端（或运营者用 `presmium-speech consent`）登记，文档的提交不包含它。否则能编辑文稿的人（包括 agent）可以伪造本人的同意。默认目录在 agent 的工作目录（工作区根目录）之中，只在任务结束时复原不够：任务进行中伪造的记录可以立即用于合成（经 `lecture_synthesize`），合成的音频随任务提交。所以登记的记录由服务端以运营者的密钥 `PRESMIUM_SPEECH_CONSENT_KEY` 签名（HMAC-SHA256），语音服务只承认签名有效的记录，没有密钥时克隆音色不可用；agent 与被执行的代码的环境都去掉了 `PRESMIUM_` 开头的变量，拿不到密钥。agent 写进该目录的文件因此不起作用，任务结束时照旧复原，agent 对该目录的权限请求一律拒绝。WP-82 的拒绝用例：写在文稿中的记录，以及没有签名而直接写进同意记录目录的记录，在它们存在期间都被忽略。
> 20. **服务提供方来自运营者的配置**（D4；SHARED 模式中由 gateway 给出，第 30 条）：界面要在任何请求之前写明服务提供方。语音引擎由 `PRESMIUM_SPEECH_<ID>_PROVIDER` 给出（运营者定义的引擎必需；内置的 `volcengine` 为“火山引擎”，英文界面为 Volcengine）；助手由 `settings.presmium.assistant.provider` 给出（模型的服务提供方，如 DeepSeek），不再退回 agent 在 ACP `initialize` 中报告的名字，那个名字是运行时（如 DeepSeek Harness），另行显示（`AgentRuntime.runtime`、`AgentClient.runtime()`）。
> 21. **AI 合成的标识有验收**（D5，N-08）：播放合成的讲授显示“AI 合成语音”（`e2e/lecture-script.spec.ts`，WP-83）；合成的音频文件与它的 `<键>.json` 带 AI 生成的标识与 WP-82 先行验证确定的 GB 45438 元数据（`addon-speech/test/speech.test.ts`）。标识由语音服务在写入缓存时加入，不由引擎写入；合成缓存保留引擎返回的格式，不重新编码（本文 7.4 节写的是 `<键>.ogg`）：语音服务向引擎请求 Ogg/Opus，只给出其他格式的引擎按其格式保存，假引擎为 WAV，所以验收检查的是 WAV 的 `LIST`/`INFO` 块（`ir.md` 9.1 节）。
> 22. **具名环境交给浏览器端插件的契约**（D6）：`PluginContext.environments` 原先没有来源。`HostStart`、`StartOptions` 与 `KernelOptions` 都增加 `environments?: Record<string, EnvironmentSpec>`，由 WP-73a 写入契约并在内核中传递，两种宿主适配（WP-73b）把 IR 的 `config.execute.environments` 交给 `HostStart`。
> 23. **修改任务由助手统一处理**（D7；提交改为在审阅之后，第 28 条）：`annotations`、`chat`、`transcript` 与起草都按同一条规则提交与撤销，由 WP-81 实现（含 `transcript`）；WP-84 只构造讲授一侧的请求。
> 24. **工作区服务中的受众**（D8，P-55）：`presmium serve` 中角色为读者的成员（学习者）看到学生视图：读者的站点按受众 `student` 编译，读者成员的 MCP 令牌与所有 `tutor` 令牌也只读学生视图；编辑者与所有者看到全部。`ServerHost` 按视图（`full`、`student`）给出文稿，服务端按成员转发到对应的站点（WP-73a、WP-78、WP-79 留出位置，WP-87 实现筛选并验收）。
> 25. **单独运行的语音网关的安全**（D9；单独的语音网关由第 30 条的 `presmium gateway` 代替，这些要求转到它）：`presmium-speech serve` 持有运营者的凭据，默认只监听 `127.0.0.1`，校验 `Host` 与 `Origin`，要求 `Authorization: Bearer` 令牌（同 MCP）；WP-82 一个用例。
> 26. **补齐的验收用例与文字**（D10）：P-104 的 jax-js 张量代码（WP-75）；P-131 的倍速与字幕、P-90 可选的摄像头（WP-77，讲授轨格式因此增加 `video`）；P-105 的 `prompt` 方式与远端内核的录制输出与现场一致（WP-76）；P-101 同一浏览器上下文中按页面隔离（WP-73b）；P-68 的文字预测（WP-88）；`STATUS` 到达 MCP 的 `get_classroom`（WP-78）；WP-73a 的 `Origin` 检查与 `presmium dev --allow`；WP-81 面板上的服务提供方。`wbs.md` 中 WP-72 的标题列出 P-42、P-102、P-122 的增补与 P-107、P-137；`ir.md` 2.1 节含义不明的“（第 9 节）”改为指向 `architecture.md` 第 11 节。
>
> 以下各条是 WP-72 第四轮中验收者的决定（D11 至 D16，用户批准了 D11 并要求了 D12），输入是第三轮评审的两个主要问题（文稿目录中的 Node 插件在 `presmium serve` 进程中运行；同一 uid 的子进程能读服务进程的 `/proc/<pid>/environ`，所以放在同一 uid 进程环境中的秘密挡不住被执行的代码与 agent）与 deltabox 的先行验证（第 11 节）。它们取代前面几条中与之冲突的部分机制：
>
> 27. **DeepSeek Harness 随助手插件集成**（D11）：DeepSeek Harness 是助手插件的依赖（精确固定的版本），运营者配置了模型访问（`DEEPSEEK_API_KEY`，或成对的 `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY` 与必需的 `PRESMIUM_MODEL_PROVIDER`）时自动以子进程启动（ACP over stdio），不需要另外安装或给出命令；`PRESMIUM_AGENT_COMMAND` 与 `settings.presmium.assistant.command` 只用来替换运行时（Claude、Codex、Gemini 的 ACP 适配），这时仍要给出服务提供方（第 20 条）。会话日志上传与遥测由我们的模板关闭。配置模型访问就是 N-08 所说的显式开启：没有它（也没有替换的运行时）时助手不可用、不启动任何进程。随包运行时的服务提供方取自模型访问（`DEEPSEEK_API_KEY` 为 DeepSeek）。DeepSeek Harness 要求 Node 22.19，根目录的 `engines` 要提高（WP-80 提出）。
> 28. **修改审阅**（D12；macOS 由第 43 条改为先行验证之后启用）：内核契约 `CHANGE_REVIEW`（Node 端服务，`architecture.md` 4.8、10.7 节）有两个实现：新的运营者插件 `addon-deltabox`（先行验证的方案 C：Presmium 持有文档目录上的 deltabox 会话，把会话视图作为 agent 的 `cwd`，经 deltabox 的 Node 绑定取差异、记检查点、`commit` 与 `abort`；每个工具调用一个检查点；Linux 与 macOS），以及助手内置的 git 实现（deltabox 不可用时：文档目录对任务开始时快照的差异，拒绝时恢复这些路径并删除任务新建的文件）。助手的审阅界面逐个文件显示差异，可以全部接受、全部拒绝或拒绝某个文件；deltabox 不能撤回单个文件，所以接受之后从任务开始时的快照恢复被拒绝的文件。默认 `settings.presmium.assistant.review: required`（先审阅后提交），`auto` 保持之前的自动提交。接受即经 `REVISIONS` 提交（我们的尾注，git 的钩子关闭），接受之后的撤销仍是 `git revert`。会话的项目中不设 deltabox 的拒绝规则（先行验证：被沙箱的 `rm -rf` 删除被拒绝的目录时引擎故障并丢失数据）。agent 的 `cwd` 因此从工作区根目录改为文档目录（或它的视图）。契约另增 `AgentEvent` 的 `step`、`review`，`AgentTask.review` 与 `ReviewDecision`。新的工作包 WP-90 交付 deltabox 插件，WP-81 交付审阅界面与 git 实现。
> 29. **两种信任模式**（D13；进程沙箱的启动方式与默认启用见第 41、42 条）：LOCAL（`presmium dev`、`build`、`check`，以及只监听本机、没有登录的 `presmium serve`）：唯一的用户就是运营者，被执行的代码与 agent 以他的身份受信任，只做纵深防御：第 17 条（a）清理子进程的环境；编译时的代码在可用时经 deltabox 的进程沙箱运行（新的契约 `PROCESS_SANDBOX` 与 `RunContext.sandbox`：预热的会话、网络拒绝、启动进程的环境只有 `PATH` 与 `HOME`）。同一 uid 的代码能读这个用户能读的一切，这如实写在 `architecture.md` 9.4 节，文档不再声称编译时的代码“读不到”凭据，只说它不能经自己的环境拿到。SHARED（带登录的 `presmium serve`）只支持随仓库的 compose 布局：`serve`、`gateway`、`sandbox` 三个容器，uid 各不相同；由文稿决定的代码从不在 serve 与 gateway 中运行。第 17 条（b）的编译确认（`compile: approve|trusted|off`）只在 SHARED 中（LOCAL 全部执行）；`settings.presmium.exec.sandbox` 与第 17 条中“沙箱不支持的语言不执行”去掉：sandbox 容器代替了 Jupyter 沙箱，所有语言照常执行；编译器的执行选项 `sandbox` 改为 `remote`（交给 agent-host）。执行插件的运行器改用运行目录中的文件传递输入与结果（deltabox 不转发标准输入与文件描述符 3）。契约增加 `TrustMode` 与 `ServerContext.trust`、`NodeServiceContext.trust`。
> 30. **gateway**（D13）：SHARED 中唯一持有全部第三方凭据（模型、语音、远端环境）的进程 `presmium gateway`；同意记录与服务提供方的名字是它的运营者数据；它为 agent 会话、运行与构建签发限定令牌；DeepSeek Harness 把 gateway 的 Messages 兼容地址作为 DeepSeek 的 base URL，只拿到会话令牌，从不拿到真正的密钥。插件经新的 `gateway()` 贡献把用到凭据的部分放进 gateway（`GatewayContext`、`GatewayContribution`），在 serve 与 agent-host 中经 `GatewayAccess`（`ServerContext.gateway`、`NodeServiceContext.gateway`、`EnvironmentContext.gateway`、`RunContext.gateway`、`AgentSessionOptions.model`）调用它。同意记录因此在 SHARED 中位于 sandbox 访问不到的 gateway 容器，在 LOCAL 中运营者就是唯一的用户，第 19 条的 HMAC 签名（`PRESMIUM_SPEECH_CONSENT_KEY`）不再需要，去掉；同意记录目录相对于运营者目录。第 25 条的单独语音网关 `presmium-speech serve` 由 `presmium gateway` 代替，`Host`、`Origin` 与令牌的要求转到它。`SpeechService.engines()` 改为返回 `Promise`（SHARED 中列表取自 gateway）。gateway 的宿主（令牌、挂载、`/mcp` 的转发）由 WP-73a 建在服务端包中，各插件为它贡献路由（语音 WP-82，远端环境 WP-76，模型 WP-80），WP-82 验收 gateway 中的语音与运营者数据。
> 31. **agent-host**（D13；工作区站点的开发服务器由第 36 条移入）：`presmium agent-host` 在 sandbox 容器中运行助手的 ACP 客户端与 DeepSeek Harness 子进程、全部编译时执行与构建（构建会在服务端渲染文稿的组件，所以也算执行文稿的代码）、deltabox 的审阅会话；它没有秘密，网络只到 gateway，以 root 读取令牌文件后降权。serve 经认证的 HTTP/SSE 接口调用它，请求都由 serve 发起；LOCAL 中同样的契约（`AGENT_RUNTIME`、`CHANGE_REVIEW`、执行）在 serve 进程中直接运行。MCP 经 gateway 转发到 serve（`McpAccess.url`）。WP-79 交付 agent-host 与 compose 布局（网络、数据卷的权限、镜像）。
> 32. **插件的来源**（D14，回应第三轮的主要问题一；`renderers.<id>.package` 由第 38 条纳入，`addon-deltabox` 由第 42 条改为随 CLI 安装）：`presmium serve`（两种模式）、gateway 与 agent-host 只从运营者控制的位置加载 Node 插件：安装在工作区根目录、列在运营者设置 `settings.presmium.workspace.plugins` 中的包（D14 所说“列在设置中”的位置）；文稿相对路径的插件与文稿目录 `node_modules` 中的插件被拒绝，给出错误级诊断 `presmium.plugins`（WP-79 的拒绝用例）。同一列表中声明 `operator: true` 的插件（如 `addon-deltabox`）在所有命令中每份文档都加载。`presmium dev`、`build`、`check` 照旧接受文稿自己的插件（LOCAL 的残余风险）。
> 33. **agent 的工具按模式**（D15）：SHARED 中作者的 DeepSeek Harness 模板 `presmium-shared` 关闭 shell 与命令执行（以及联网）工具，代码只经 MCP 的 `run_code` 在 agent-host 中执行；LOCAL 的模板 `presmium` 保留 shell，`workspace-write` 加询问。替换的运行时不受我们的模板约束，所以只在 LOCAL 中生效；SHARED 的用例用随包的 DeepSeek Harness 与测试起的 Messages 兼容假模型服务。
> 34. **残余风险与上游问题**（D16，回应第三轮的主要问题二）：`architecture.md` 9.4 节写明两种模式中措施之后仍然拿得到的东西（LOCAL：同一 uid 的代码读得到服务进程与 agent 的环境、用户的文件、Docker 的套接字；SHARED：sandbox 中同 uid 的进程互相可见，但那里只有限定令牌）；9.5 节列出先行验证发现的五个上游问题，未提交，由验收者先征得用户同意。第四轮另发现一项 SHARED 的残余风险：文稿的组件在所有者的浏览器中以工作区的源运行，能以所有者的身份回答确认；由第 37 条的所有者控制台处理。9.4 节的几处措辞由第 44 条修正。
> 35. **第三轮的次要问题与其他调整**（开发服务器“只编译不运行”由第 36 条取代）：WP-78 中 `presmium serve` 的 `run_code` 用例移到 WP-80（WP-78 与 WP-79 并行，SHARED 要 WP-79 的 agent-host；`packages/mcp/test/` 不必为此引用别的宿主）；去掉任务结束时复原 `.presmium-operator/`（它会撤掉所有者在任务进行中登记的记录；agent 对该目录的权限请求照旧一律拒绝）；工作区的 git 命令关闭钩子与 fsmonitor，compose 布局中只有 serve 能写 `.git/` 与工作区根目录；SHARED 中工作区站点的开发服务器只编译不运行文稿的组件（内联的 PostCSS 配置）；WP-82 依赖 WP-79（SHARED 的用例），WP-81 依赖 WP-90；`scripts/fetch-docs.sh` 加入 deltabox-lite 的文档（`vendor/docs/deltabox`）。
>
> 以下各条是 WP-72 第五轮对验证意见的修正。验证指出第四轮之后仍有两个主要问题（SHARED 中文稿决定的代码仍在 serve 容器中运行；文稿的组件能在所有者的浏览器中代他回答所有者独有的确认）与若干次要问题。第 37 条是开发者的提议，待验收者确认；其余各条把 D11 至 D16 落实得更准确，取代前面各条中与之冲突的部分：
>
> 36. **SHARED 中工作区站点的开发服务器在 agent-host 中**（第五轮的主要问题一）：第 31、35 条让 serve 中的 VitePress 开发服务器“只编译不运行文稿的组件”，这不成立：Vite 在开发服务器的 Node 进程中会加载文稿决定的模块（文稿组件引用的 VitePress 数据加载器 `*.data.*` 在开发中同样运行 `load()`，还有配置文件与样式预处理器的插件），而开发服务器是 serve 的同 uid 子进程，能读 serve 的 `/proc/<pid>/environ`（gateway 的服务令牌、agent-host 的令牌、登录代理的共享密钥），也能写 `.git/` 与工作区根目录的 `node_modules`；生成的站点项目原先在文稿目录的 `.presmium/` 中，sandbox 中的代码与 agent 都能改它。定稿：工作区站点的开发服务器（两个视图）同构建一样在 agent-host 中运行（`POST /v1/sites` 等接口：serve 编译后送去 IR，把浏览器的其余请求与 HMR 转发过去；生成的站点项目与 Vite 的缓存在 sandbox 容器自己的目录中）。serve 只做编译中不执行代码的部分。serve 的三个秘密同 agent-host 一样取自只有 root 可读的文件，以 root 启动、读取后降权，不再出现在它的环境中，serve 的 uid 能读的文件里也没有秘密，所以文档目录中指向别处的符号链接也读不到秘密；编译器另外按真实路径只读工作区之内的文件（`.git/` 除外），指向别处的符号链接（如 `/proc/self/environ`）给出错误级诊断 `presmium.files`（纵深防御）。第 35 条的内联 PostCSS 配置不再需要，去掉。WP-79 的拒绝用例：数据加载器只在 agent-host 中运行、父进程链上没有秘密，符号链接不被读取；部署用例检查 serve 的环境中没有它的令牌。
> 37. **所有者控制台**（第五轮的主要问题二；开发者的提议，待验收者确认）：文稿的组件在所有者的浏览器中以工作区站点的源运行，带着登录代理的 Cookie，能以所有者的身份回答 `workspace` 范围的确认（`compile: approve`、`approve` 时的 `run_code`、agent 写文档目录之外）并登记同意记录，N-08 的“只由所有者回答”“由所有者登记”在 SHARED 中因此不成立。提议：SHARED 中所有者独有的操作放在另一个源上的所有者控制台（主机名 `PRESMIUM_CONSOLE_HOST`，登录代理把它也转发给 serve）：那里只有 Presmium 自己的静态页面（CSP 禁止被嵌入，确认的说明、代码与差异以纯文字显示，不渲染文稿的任何内容）；`workspace` 范围的确认只发往控制台，serve 只接受来自控制台的源、带 `Presmium-Console` 请求头的回答；`role: 'owner'` 的路由只挂在控制台上，站点上得到 404。内容范围的操作（提交修改任务、接受审阅、`content` 范围的确认）仍可能被站点上的组件以打开它的成员的身份发出，列为残余风险（`architecture.md` 9.4 节）。契约只改 `Route.role` 的说明；WP-73a 交付并以 `server.test.ts` 与 `e2e/server.spec.ts` 验收，WP-79、WP-80、WP-81、WP-82 的 SHARED 用例改为在控制台上回答或登记。LOCAL 中没有控制台。
> 38. **替换渲染端的包同样受 D14 约束**：`renderers.<id>.package` 与 `plugins` 经同一个加载器加载，也接受相对路径与文稿目录的 `node_modules`；`presmium serve` 中它同样只接受运营者列出、安装在工作区根目录的包。WP-73a 的插件策略与 WP-79 的拒绝用例都包括它。
> 39. **运营者目录移到工作区之外；SHARED 不支持单份文稿的仓库**：第 19 条的默认目录 `<工作区>/.presmium-operator/` 在单份文稿的仓库中就在文档目录里，agent 的文件工具不经请求就能写它，它又被 `.gitignore` 忽略、不在 git 实现的审阅中。LOCAL 的运营者目录改为用户状态目录中按工作区区分的目录（`${XDG_STATE_HOME:-~/.local/state}/presmium/operator/<工作区标识>/`，可以用 `--operator-dir` 或 `PRESMIUM_OPERATOR_DIR` 另行指定），插件经新增的可选字段 `NodeServiceContext.operatorDir`、`ServerContext.operatorDir` 得到它（WP-73a），工作区模板不再为它写 `.gitignore`。SHARED 的 compose 布局中，单份文稿的仓库的文档目录就是工作区根目录，sandbox 能写它就能改工作区配置与 `node_modules/`，所以 SHARED 只支持文档在子目录中的工作区，serve 对单份文稿的仓库拒绝启动（WP-79）。单份文稿的仓库（LOCAL）中审阅里的工作区配置要所有者另行允许的规则补上验收用例（WP-81）。
> 40. **compose 的网络**：第四轮的表中 oauth2-proxy 只在 `edge` 上，又是唯一发布端口的服务，而 `egress` 是唯一能连外网的网络，两者矛盾：oauth2-proxy 要连身份提供方，Docker 也不能从内部网络发布端口。定稿：`edge` 与 `agents` 是内部网络；新增 `public`，其中只有 oauth2-proxy，它在这里发布端口并连接身份提供方；`egress` 中只有 gateway。serve 与课堂服务因此连不到外网（WP-79 的部署用例检查 serve）。
> 41. **进程沙箱的启动方式与隔离方式**：第 29 条写“以 `env -i` 启动 deltabox”，WP-90 却经进程内的 Node 绑定使用它，两者不能同时成立；先行验证也只对命令行验证了 `env -i`，而 copy-private 中被执行的命令能读到带着调用者全部环境的父进程。定稿：`addon-deltabox` 只在一个辅助进程中加载 Node 绑定（`loadNative()`），这个进程的环境只有 `PATH`、`HOME` 与 `DELTABOX_STATE_DIR`，审阅与进程沙箱的调用经它的标准输入输出转发，deltabox 的进程都是它的后代；隔离方式是 cbcow-through（`--require-fs-mode`，sandlock），不用 copy-private；结果文件在 through 模式中立即可见，读回后 `abort`。compose 的覆盖配置为此给 sandbox 加 FUSE 所需的权限与 `SYS_PTRACE`（在会话中执行命令）。
> 42. **进程沙箱默认启用**（D13 的“可用时”）：第四轮只在运营者把 `addon-deltabox` 列进工作区配置时启用，单份文稿的 `presmium dev` 因此从不经进程沙箱。定稿：`addon-deltabox` 随 CLI 安装（`@presmium/cli` 在 `package.json` 中依赖它，源码不引用），编译器在所有命令中按包名加载它，主机满足条件时登记服务；运营者用 `settings.presmium.deltabox` 关闭两项服务，或用其中的 `read` 放开另外的只读路径（解释器的前缀自动加入）。为此 WP-90 移到 WP-79 之后（与 WP-80 并行），并拥有 `packages/cli/package.json`（只增加这条依赖），J2 中 WP-87 的归属相应去掉这个文件。
> 43. **macOS 待先行验证**（偏离 D12 的“Linux 与 macOS”）：先行验证只读了 macOS 的文档；不在沙箱中的写入者（DeepSeek Harness）对 cbcow-private 私有 `LIVE` 树的写入在 macOS 上是否被记录没有实测。定稿仍把 macOS 列为目标平台，但在 macOS 主机上的先行验证通过之前，插件在 macOS 上不登记 `CHANGE_REVIEW` 与 `PROCESS_SANDBOX`（助手用 git 实现，编译时没有进程沙箱）；先行验证在 WP-90，没有 macOS 主机时由 WP-89 补做。
> 44. **残余风险的措辞**（`architecture.md` 9.4 节）：任务进行中作者的改动，git 实现把它们算进审阅；deltabox（cbcow-through）不记录主机上直接写入的改动，全部拒绝之后它们仍在，但拒绝同一个文件时从快照恢复会覆盖它们（第四轮写成都算进 agent 的改动，与先行验证不符）。SHARED 中别的成员的代码在有进行中任务的文档目录里写入的文件，会出现在这个任务的审阅中，可能以发起人的名义提交（第四轮写成不在任何审阅中）。sandbox 中被执行的代码能读同一容器中每个 DeepSeek Harness 进程的环境，也就是全部进行中会话（包括其他成员与所有者的会话）的模型令牌，内核允许时还能读它们的 MCP 令牌（第四轮只写了“这个会话的模型令牌”）。另记 git 实现不审阅被 `.gitignore` 忽略的文件。
> 45. **LOCAL 中 agent 的模型凭据**：WP-80 去掉 agent 环境中全部 `PRESMIUM_` 开头的变量，却没写 `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY` 怎样到达只读 `DEEPSEEK_BASE_URL`、`DEEPSEEK_API_KEY` 的 DeepSeek Harness。定稿：助手把它们改名传入；用 `DEEPSEEK_API_KEY` 时不传 `DEEPSEEK_BASE_URL`（进程环境中的同名变量也去掉），密钥只发往官方地址；两者都设置时 `PRESMIUM_MODEL_*` 优先。WP-80 的 `dsh.test.ts` 验收。
> 46. **修改审阅是聚合**：验收者要求的是审阅聚合，第四轮把它写成任务内的实体，而“同一文档目录至多一个审阅”跨越任务、只由服务保证。定稿：修改审阅是以文档目录为标识的聚合根，任务经 ID 引用它，“一文档一修改任务”也由它的标识保证（`domain-model.md` 第 13 节）。
> 47. **P-115 的措辞**：验收者只允许改 N-08、N-09 两行，`requirements.md` 中 P-115 的“每批修改自动成为一个 git 提交”与 6.12 节验收的“形成一个提交”仍是 D12 之前的自动提交。6.12 节加了说明（默认先审阅后提交，`auto` 同原文），两处的措辞待验收者修订。

本文是需求 v0.7 新增范围（`requirements.md` 6.10 至 6.14 节，N-08、N-09）的总体架构：执行环境、智能体、工作区、讲授四个新的限界上下文，以及它们共用的服务端与契约。WP-72 把定稿的内容并入 `domain-model.md`、`architecture.md`、`ir.md` 与契约源码；在那之前，本文是新增范围的设计依据。调研记录（DeepSeek Harness、浏览器 GPU、远端环境、语音）的结论已经吸收进本文，出处见各节。

## 验收者的决定（WP-72 定稿）

WP-72 经四轮设计与评审（提交 29b524f 至 a1410b2），验收者决定：

- 接受本机模式与整体架构，以及第四轮的偏离 36 至 47：站点开发服务器在 agent-host 中运行、所有者控制台使用单独的来源（偏离 37）、CLI 默认依赖 deltabox 插件且 WP-90 排在 WP-79 之后并拥有 `packages/cli/package.json`。
- macOS 上暂不启用 deltabox，修改审阅使用 git 实现，直到在 macOS 主机上完成先行验证。
- 共享部署更深的攻击面（serve 写入时跟随沙箱埋下的符号链接、9.4 节的表述、`RunContext.env` 的计算方、令牌文件的读取、控制台规则对代理的覆盖）单列为 WP-91，按明确的威胁模型处理并经专门的安全评审；在此之前 SHARED 模式为实验性。根本方向是 serve 不向沙箱可写的目录写入任何内容。
- 上游问题（9.5 节）不提交，只记录。

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
- **从模板新建文档**：模板放在 `templates/document/`（1.0 起随 `@presmium/workspace` 发布，在 `packages/workspace/templates/document/`，WP-93a）。也可以由 agent 起草，相当于一轮对话修改。

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
| Runno 的运行时二进制能否自托管、离线加载，以及在 Node 中运行同一份二进制 | WP-74（已完成，结论见下） |
| JSPI 在各浏览器中的可用性，决定 Python 的 WebGPU 桥是否提供同步写法；SwiftShader 在无头 Chromium 中的计算着色器与计时；适配器的默认限制 | WP-75（已完成，结论见下） |
| JSPI 在各浏览器中的可用性，决定 Python 的 WebGPU 桥是否提供同步写法 | WP-75 |
| Vite 代理能否在 WebSocket 升级时加凭据；浏览器访问 JupyterHub 用户服务器时的跨域；`runsc` 与 GPU 同时使用 | WP-76（已完成，结论见下；`runsc` 与 GPU 的组合没有验证） |
| 录制文件在各浏览器中能否跳转；WebM 时长修正 | WP-77 |
| 火山引擎转写中英混说的效果；Safari 26 录制 Ogg/Opus；GB 45438 元数据字段在各容器中的写法；`@mediabunny/server` 附带的 FFmpeg 是 LGPL 还是 GPL | WP-77、WP-82、WP-83（FFmpeg 是 GPL，只导出 WebM，结论见下） |
| dsh 配置项 ID；dsh 在调用 MCP 工具前是否询问 | WP-80（已完成，结论见下） |
| deltabox-lite 能否用于修改的审阅与回滚、能否作为编译时执行的进程沙箱；dsh-deltabox 能否直接用 | WP-72 第四轮（已完成，结论见下） |
| 两种开发服务器把 `/__presmium/` 代理到主进程的服务端；页面的长连接与端到端用例；myst-parser 的角色选项（`wbs.md` 没有为 WP-73a 列出先行验证，开始时做了这几项小规模实测） | WP-73a（已完成，结论见下） |
| 共享的运行器经包的 `exports` 以 `?raw` 进入两种形态的 Worker；Slidev 的 `{monaco-run}` 在构建产物中运行 Python 并接收执行器与会话；运行器的富输出（`IPython.display`、matplotlib）；在浏览器中解析 Markdown 输出（`wbs.md` 没有为 WP-73b 列出先行验证，开始时做了这几项小规模实测） | WP-73b（已完成，结论见下） |
| mystmd 的 `myst-ext-card`、`myst-ext-grid`、`myst-ext-tabs`、`myst-ext-button` 与 myst-parser 1.7 一起用时给出的 mdast；它们在两种形态与 notebook 中的写法（`wbs.md` 没有为 WP-85 列出先行验证，开始时做了这几项小规模实测） | WP-85（已完成，结论见下） |
| 组件的子块能否分开显示（IR 运行时与幻灯片中的插槽）；子块的 `v-click` 在组件插槽中是否照常按步骤出现；课堂服务是否接受 `predictions` 的写入（`wbs.md` 没有为 WP-88 列出先行验证，开始时做了这几项小规模实测） | WP-88（结论见下） |
| MCP SDK v2 在服务端的挂载（Fetch 处理函数与调用方）、资源订阅与通知、JSON Schema 输入、stdio；网页形态的放映视图中能否回答确认（`wbs.md` 没有为 WP-78 列出先行验证，开始时做了这几项小规模实测） | WP-78（已完成，结论见下） |
| myst-parser 对带 `:file:` 的 `{csv-table}` 给出什么；构建产物中的文字是否以原样出现（泄漏扫描的前提）；工作区站点开发服务器中 IR 模块与搜索索引的地址（`wbs.md` 没有为 WP-87 列出先行验证，开始时做了这几项小规模实测） | WP-87（结论见下） |

**deltabox 的先行验证（2026-10-16，deltabox-lite 0.1.1、dsh-deltabox 0.1.2、dsh 0.2.0-rc.2）**的结论：

- **主机与容器**：在 Linux 7.0（ext4、`/dev/fuse`、Landlock ABI 8）上 cbcow-through、cbcow-private、copy-private 三种模式都能以 `--require-fs-mode` 启动，没有降级的保护。预编译的二进制与 `deltabox.node` 要求 glibc 2.39（`node:22-bookworm` 不行，用 Ubuntu 24.04 或 Debian trixie）。容器中 copy-private 只需 `SYS_PTRACE`；cbcow 需要 `/dev/fuse`、`SYS_ADMIN` 与 `apparmor:unconfined`，都会削弱外层的容器。
- **审阅与回滚**：差异按文件给出（类型、大小、增删行数、统一差异），检查点与 `diff --from`、`abort --checkpoint`（只能撤回末尾的若干步）、`commit` 都可用；没有撤回单个路径的操作，所以逐个文件的拒绝要在接受之后从快照恢复。不在沙箱中的进程经视图的写入在 cbcow 模式中被记录（copy-private 中不被记录，提交时丢失）；cbcow-through 中主机上的 `fs.watch` 立即看到经视图的写入。同一项目同一时间只有一个会话；一个会话的操作串行。至多 100 个检查点。
- **安全探测**：cbcow 模式中被执行的代码的父进程是清理过环境的 deltabox 进程，读调用者的 `/proc/<pid>/environ` 得到 `EACCES`，看不到其他进程，Docker 的套接字与 D-Bus 不可连接，`deny_all` 拒绝全部网络（含本机回环），项目之外不可写，子进程的环境只有约 11 个基本变量。copy-private 中父进程是带着调用者全部环境的 deltabox 命令行（以 `env -i` 启动即可避免；定稿不用 copy-private，并从环境只有 `PATH`、`HOME` 与 `DELTABOX_STATE_DIR` 的辅助进程使用 deltabox，第 41 条）。拒绝列表有缺口（新文件、删除、相对的 `.git` 规则），`/tmp` 总是可读，`filesystem.write` 在项目内部不收窄；以文档目录为项目才能把写入限制在文档目录中。删除被绝对路径拒绝的目录会让引擎故障并丢失数据。
- **与 DeepSeek Harness 的组合**：方案 A（dsh-deltabox 插件）在 ACP 下不可用：`dsh-acp` 不转发没有 `callId` 的确认，任务审阅落到失败关闭，agent 空闲时修改被静默回滚；它的策略写死，没有公开的源码，只支持 dsh 的两个预览版。方案 B（dsh 在 `deltabox exec` 中运行）不可用：标准输入不转发，输出到退出时才给出，会话锁会挡住审阅。采用方案 C：Presmium 持有会话，dsh 照常运行，以视图为 `cwd`；dsh 的 shell 子进程因此没有 deltabox 的环境与进程隔离（dsh 的沙箱只管文件的写入）。
- **编译时执行**：Linux 上可用，但执行插件的协议要改为经运行目录中的文件传递输入与结果；以临时目录为项目、文稿目录列为只读。开销（10 次 `print(42)` 的平均）：直接运行 12 ms，`run --abort` 约 210 ms（cbcow）至 370 ms（copy-private），预热会话中的 `exec` 约 20 ms，会话的 `abort` 约 3 ms。
- **macOS**（只读了文档，没有实测）：Seatbelt、APFS 克隆与 FSEvents，不需要 macFUSE；cbcow-through 在项目本身中运行并假定 deltabox 是唯一的写入者，所以计划用 cbcow-private。不在沙箱中的写入者对私有 `LIVE` 树的写入是否被记录没有验证，所以 macOS 上在先行验证通过之前不启用（第 43 条）。
- **许可与维护**：核心 Apache-2.0，sandlock-core Apache-2.0，fuser MIT，dsh-deltabox MIT；仓库 2026-08 创建，约 6 位作者，0.1.0 与 0.1.1 都在 2026-10-14 发布。
- 这些结论写进了第 28 至 31、34 条（第五轮的第 41、43、44 条按它们修正了启动方式、macOS 与残余风险的措辞）与 `architecture.md` 9.4、9.5、10.5 至 10.7 节；五个上游问题见 `architecture.md` 9.5 节。

**WP-73a 开始时的验证（2026-10-16，VitePress 1.6.4、Slidev 53.0.0、myst-parser 1.7、@hono/node-server 2.1.3、http-proxy-3 2.0.1、Playwright 1.64.1）**的结论：

- **网页的开发服务器**：生成的 VitePress 配置中 `vite.server.proxy` 的键可以是以 `^` 开头的正则。`^/__presmium/(?!(?:ir|source)(?:[/?]|$))` 把插件的路由与服务端自己的路由（含 WebSocket，`ws: true`）转给服务端，网页渲染端自己的 `/__presmium/ir`、`/__presmium/source` 仍由开发服务器回答（插件在 `configureServer` 中直接加的中间件本来就排在代理之前，正则只是不依赖这个顺序）。代理保留 `Host`（`localhost:<端口>`）与页面的 `Origin`，服务端的本机检查照常通过。
- **幻灯片的开发服务器**：Slidev 合并生成文稿目录中的 `vite.config.ts`，其中的 `server.proxy` 同样生效；`presmium dev --to slides` 中经 `http://localhost:3030/__presmium/<插件 ID>/…` 得到服务端的回答。Slidev 的 `configs` 带着头部的全部字段，所以开发中的头部写 `presmiumServer: true`，`addon-core` 据此给出服务端的客户端；页面要有 `addon-core`（文稿的 `plugins` 列出它，示例文稿就是这样）才有宿主适配。
- **长连接与 `networkidle`**：Playwright 判断网络空闲时不算 `EventSource` 的请求，但一个响应体没有被读完的 `fetch` 一直算作进行中，`page.waitForLoadState('networkidle')`（`e2e/fixtures/deck.ts` 的 `openDevPage`）因此永远等不到。控制通道用 SSE 接收没有问题，报告与回答的 `POST` 必须读完响应体；宿主的实现这样做。
- **myst-parser 的角色选项**：`mystParse` 的 `roles` 选项接受带 `options`（`String`、`Number`、`Boolean`）的角色规格，``{probe mark=提示 count=2}`x` `` 的选项按类型读出；只写键不写值（``{probe flag}`x` ``）是 `mystRoleError`。登记的角色不影响 MyST 自带的 `{sub}` 等，`defaultOptions.roles` 列出它们的名字，插件登记同名的角色是错误。
- **依赖**：`@hono/node-server` 2.x 以 `hono` 为对等依赖，服务端包精确固定 `hono` 4.13.13（`http-proxy-3` 2.0.1 没有对等依赖）。Node 22.18 起默认去掉类型标注，测试用的 `serve` 模式宿主（`packages/server/test/fixtures/serve-host.ts`）不经 jiti 直接运行；`@presmium/server` 不在开发依赖中引用 `@presmium/cli`（两者互相依赖时 pnpm 的符号链接成环，`scripts/check-layering.mjs` 遍历时 `ELOOP`），测试按路径找到 CLI 的可执行文件。

**WP-73b 开始时的验证（2026-10-16，Slidev 53.0.0、VitePress 1.6.4、Vite 8.3、Pyodide 314.0.7、Python 3.13 与 matplotlib 3.10）**的结论：

- **共享的运行器**：`import runner from '@presmium/kernel/runner.py?raw'` 在执行插件的 Pyodide Worker 中可用：Vite 先按包的 `exports`（`"./runner.py": "./src/runner.py"`）解析子路径再处理 `?raw`，网页（VitePress）与幻灯片（Slidev）的构建产物中的 Worker 都含运行器的源码；Node 端用 `createRequire(...).resolve('@presmium/kernel/runner.py')` 读它。内核不读它，分层检查不受影响。
- **Slidev 的 `{monaco-run}`**：构建产物中可用（不只开发服务器），运行按钮的 `title` 为 “Run code”，输出在 `.slidev-runner-output` 中；执行插件已有的 `setup/code-runners.ts` 经 `executor` 服务以 Pyodide 运行 Python。代码块属性只读到第一个 `}`：`{autorun:false,height:'auto'}` 可用，任何嵌套的对象（包括文档中的 ```` ```ts {monaco} { editorOptions: { wordWrap:'on'} } ````）都使 `slidev build` 报 “Error parsing JavaScript expression”，双引号的字符串同样不行。因此执行器与会话写在生成文稿的头部（`presmiumRuns`），代码块以 `runnerOptions:$slidev.configs.presmiumRuns['<键>']` 引用（`$slidev.configs` 是文档化的全局上下文，带着头部的全部字段）。幻灯片形态控制台中的 FloatingVue 错误在没有 `{monaco-run}` 的示例文稿中同样出现（`architecture.md` 9.3 节）。
- **富输出**：运行器在 `sys.meta_path` 的最前面提供 `IPython`、`IPython.display` 与 matplotlib 的后端模块。直接把它们放进 `sys.modules` 不可行：matplotlib 看到 `sys.modules['IPython']` 就调用 `get_ipython()` 并比较 `version_info`（所以模块提供这两项，`version_info` 为 8.24 以上，表示不需要它为旧版 IPython 做的调整）；以 `ModuleType` 的模块级 `__getattr__` 惰性给出 `FigureCanvas` 也不行，matplotlib 用 `vars()` 读后端模块，所以后端模块由导入器在被导入时创建并直接写入 `FigureCanvas = FigureCanvasAgg` 与 `show`。`MPLBACKEND=module://_presmium_matplotlib` 只在运行期间设置。用标准库（`zlib`、`struct`）写出的 PNG 经 `IPython.display.Image` 成为 `image/png` 输出，不依赖 matplotlib。
- **浏览器中的 Markdown 输出**：`mdast-util-from-markdown` 2.1 加 `micromark-extension-gfm` 3.0 与 `mdast-util-gfm` 3.1 给出 IR 运行时已能显示的 mdast（表格为 GFM 的 `table`），在服务端渲染中同样可用，所以 `echo: false` 的 Markdown 表格在静态 HTML 中就是表格；DOMPurify 3.4 只在浏览器中加载（服务端渲染没有 DOM），HTML 输出在挂载之前显示其 `text/plain`。

**WP-74 的先行验证（2026-10-16，`@runno/wasi` 0.10.0、`@runno/sandbox` 0.10.2、`@runno/runtime` 0.10.0，Node 22.22，Playwright Chromium 1.64）**的结论：

- **二进制在哪里、能否自托管**：Runno 的语言二进制是 `@runno/sandbox` 包中的静态文件（`dist/langs`，包与 Runno 都是 MIT）：`clang.wasm`（31.2 MB，binji/wasm-clang 的 clang 8.0.1）、`wasm-ld.wasm`（19.5 MB）、sysroot `clang-fs.tar.gz`（1.8 MB，416 个文件，ustar）、`ruby-3.2.0.wasm`（24.5 MB，VMware webassembly-language-runtimes）与它只含 `.rubyopts.rb` 的 `ruby-3.2.0.tar.gz`、`sqlite.wasm`（3.6 MB，SQLite 3.26），另有本插件不用的 Python、PHP、QuickJS（包解开约 118 MB，npm 压缩包 47.6 MB）。它们可以原样复制到产物中，由同源地址加载。`@runno/runtime`（网页组件）从 `https://runno.dev/langs` 加载，它的 `WASIWorkerHost` 为交互式的标准输入用 `SharedArrayBuffer`，页面必须跨源隔离（COOP/COEP）；所以不用它，而在插件自己的 Worker 中调用 `@runno/wasi` 的 `WASI`，标准输入一次给出，不需要跨源隔离。
- **离线**：运行时复制到 `<base>wasi/` 后，网页渲染端手写的 Service Worker（预缓存产物中的全部文件）就缓存了它们；断网并清空 HTTP 缓存后重新加载页面，新的 Worker 从 Service Worker 取得运行时，编译并运行 C 程序（`e2e/exec-wasi.spec.ts`）。服务器对 `.tar.gz` 加 `Content-Encoding: gzip` 时浏览器会先解压，所以运行器按 gzip 的魔数判断是否还要解压（`DecompressionStream`，浏览器与 Node 都有，不需要另外的解压库）。
- **Node 中运行同一份二进制**：`@runno/wasi`（自称“只用于浏览器”）在 Node 22 中原样可用：它的 Worker 宿主只在使用时创建，`self.Blob` 有判断。`WASI.start(Response)` 经 `instantiateStreaming`，Node 不接受非 `Response` 的参数，所以先 `WebAssembly.compile`，再 `new WASI(ctx)`、`WebAssembly.instantiate(module, wasi.getImportObject())`、`wasi.start({ module, instance })`，浏览器中也这样做。不用 `node:wasi`（要预先打开真实目录，文件系统与浏览器不同）；也不用 `@runno/sandbox` 的 Node 接口 `runCode`：它在模块顶层导入 `node:worker_threads`（浏览器中不能用），不给程序环境变量，诊断带颜色。运行在工作线程中，超时时 `worker.terminate()` 能结束死循环中的 WebAssembly。
- **命令行**：沿用 Runno 的 clang 与 wasm-ld 参数，去掉 `-fcolor-diagnostics`（录制是纯文本）。Runno 的 SQLite 命令 `sqlite -cmd ".read <文件>"` 在 `@runno/wasi` 中把标准输入当作终端，输出版本横幅与提示符 `sqlite>`；改为 `sqlite :memory: ".read /program.sql"`：没有横幅，语句出错时退出码为 1。`abort()` 由 Runno 处理为退出码 134。
- **耗时**（本机，Node）：读取并解开 sysroot 65 ms；`WebAssembly.compile(clang.wasm)` 31 ms（惰性分层编译）；编译一个小的 C 程序 144 ms、含 `<iostream>` 的 C++ 程序 540 ms；wasm-ld 26 至 49 ms；Ruby 120 ms；SQLite 19 ms。编译时每次运行另有启动工作线程、读取与编译运行时的开销：C、C++、Ruby、SQL 各一块加一个具名环境中的 C 程序的测试文稿，只构建 notebook 的整次 `presmium build` 约 2.5 秒。浏览器中经本机的服务器，端到端用例（第一次运行时下载 52 MB、等待 Service Worker 预缓存、断网重新加载后再运行）共约 2 秒。
- **产物体积**：C 与 C++ 的运行时 52.5 MB，Ruby 24.5 MB，SQLite 3.6 MB。所以构建只发布浏览器中运行的代码需要的运行时（编译步骤写进插件配置的 `runtimes`），没有这类代码的文稿不发布。
**WP-75 开始时的验证（2026-10-16，Playwright 1.64.1 的 Chromium 156 与 Firefox 157、Pyodide 314.0.7、jax-js 0.1.25；本机有 RTX 5090）**的结论：

- **JSPI**：Chromium 156 与 Firefox 157 都有 `WebAssembly.Suspending` 与 `WebAssembly.promising`（WebKit 在本机无法启动，没有实测）。在模块 Worker 中，以 `callPromising` 调用的 Python 函数里 `pyodide.ffi.run_sync` 能等到 Promise（两个浏览器都是），普通调用则报 “Cannot stack switch because the Python entrypoint was a synchronous function”；`can_run_sync()` 在前者中为真。因此 Python 桥以异步写法为基本（代码块顶层的 `await`：以 `ast.PyCF_ALLOW_TOP_LEVEL_AWAIT` 编译，`eval` 得到协程，由 Worker 等待，两个浏览器都可用），有 JSPI 时 Worker 以 `callPromising` 运行代码块，另提供同步写法 `run_sync`。Pyodide 314 把 JavaScript 的 `null` 给成 `pyodide.ffi.jsnull` 而不是 `None`，桥里按两者判断。
- **无头 Chromium 中的 WebGPU**：默认参数下 `navigator.gpu` 存在（页面与 Worker 中都是），但 `requestAdapter()` 为 `null`，正好验证“没有适配器”的回退。加 `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader --enable-unsafe-swiftshader` 后得到 SwiftShader：`info.vendor` 为 `google`、`architecture` 为 `swiftshader`、`isFallbackAdapter` 为真、`description` 为空；计算着色器在页面与专用 Worker 中都能运行，并且有 `timestamp-query`（四个元素的向量加法约 33 µs）。加 `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=vulkan` 时无头 Chromium 经 Vulkan 用上显卡（`nvidia`、`blackwell`，不是回退适配器，约 5 µs），所以录制的 `auto` 先试这组参数，没有适配器时再用 SwiftShader。Firefox 157 在 Linux 上没有 `navigator.gpu`。
- **默认限制**：SwiftShader 适配器的 `maxStorageBufferBindingSize`、`maxBufferSize` 为 1 GiB，`maxComputeWorkgroupsPerDimension` 65535，`maxComputeInvocationsPerWorkgroup` 256，`maxStorageBuffersPerShaderStage` 10；RTX 5090 为 2 GiB、4 GiB、65535、1024、16。不带 `requiredLimits` 请求的设备只有规范的默认值（绑定 128 MiB、缓冲区 256 MiB），所以执行器按缓冲区的大小请求所需的限制，适配器不够时按“缺少限制”回退；运行的规模上限定为全部缓冲区 128 MiB、`repeat` 至多 1000。
- **录制页面**：Playwright 新开的 `about:blank` 不是安全上下文，没有 `navigator.gpu`；录制器经 `page.route` 从一个 `https:` 的源（`https://webgpu.presmium.invalid/`）提供页面与计算核心，不占端口。
- **jax-js 的导入**：Worker 没有导入映射；`data:` 模块（脚本 Worker 运行代码的方式）可以导入同源的 `http:` 模块（两个浏览器都是），所以脚本 Worker 把代码中的模块名改写为地址。jax-js 0.1.25 的 ES 模块构建是互相导入的 5 个文件、没有 wasm 文件与外部依赖，原样复制到产物的 `presmium/jax-js/` 即可；把它作为额外的入口 chunk 打包进网页形态的构建时，页面加载后内核没有启动（没有报错，原因未深究），因此不打包。SwiftShader 上 `init()` 给出 `webgpu`，2×2 矩阵乘法在 WebGPU 上得到正确结果。Slidev 构建时会为 `{monaco-run}` 代码中导入的包查找类型，在 pnpm 布局中从生成的文稿目录找不到 `@jax-js/jax` 而构建失败，测试文稿以 `renderers.slides.monacoTypesSource: none` 避开（`architecture.md` 9.3 节）。
**WP-76 的先行验证（2026-10-16，`@jupyterlab/services` 7.6.4、docker-stacks `quay.io/jupyter/base-notebook:2026-10-12@sha256:3fc2b802…`（jupyter_server 2.21.1、ipykernel 7.4.0、JupyterHub 6.0.1）、configurable-http-proxy 5.3.0、Vite 5.4 / VitePress 1.6.4、Playwright 1.64.1 的 Chromium、Docker Compose 5.1）**的结论：

- **WebSocket 升级时加凭据**：浏览器 → 网页开发服务器的 Vite 代理（`ws: true`，保留 `Host` 与 `Origin`）→ `presmium dev` 服务端的 `ProxySpec`（`http-proxy-3`，`headers` 在升级请求上同样生效）→ compose 中的 Jupyter Server，内核通道与终端的 WebSocket 都连得上，页面与它的请求中没有令牌。代理把 `Host` 与 `Origin` 设为目标的（Jupyter 校验 WebSocket 的来源与 `Host` 是否一致；放在按主机名分流的入口之后的服务器也需要自己的 `Host`）。Node 端用 `ws` 带请求头，令牌不进地址；`@jupyterlab/services` 在 Node 中以 `console.debug` 打印每个 WebSocket 与内核状态（是标准输出），插件只滤掉这两类行。内核的启动请求可以带 `path`，jupyter_server 以它的目录为工作目录。
- **浏览器以令牌访问 JupyterHub 用户服务器的跨域**：单用户服务器的 REST 接口跨源可用，需要 `--ServerApp.allow_origin_pat`（`Spawner.args`）；内核的 WebSocket 只能把令牌写在地址中，而 JupyterHub 5 起单用户服务器只在请求带 `Sec-Fetch-Mode: websocket` 时接受地址中的令牌，Chromium 的 WebSocket 握手不带这个请求头（实测为 403，Node 的 `ws` 加上它即可连上），所以单用户服务器的环境中要设置 `JUPYTERHUB_ALLOW_TOKEN_IN_URL=1`；`{user}` 要读 `<hub>/hub/api/user`，hub 默认不回答跨源请求，需要 `JupyterHub.tornado_settings.headers` 给出 `Access-Control-Allow-Origin` 与 `Access-Control-Allow-Headers: Authorization, Content-Type`。三项都设置后，另一个源的页面读出用户名、调用单用户服务器的接口并打开内核的 WebSocket。这些写进 `templates/env/kubernetes/README.md` 的 z2jh 片段。直接的 jupyter_server（compose 模板）以 `allow_origin_pat` 允许站点的来源后，`auth: prompt` 的静态页面跨源运行代码与打开 WebSocket（地址中的令牌）都可用（`e2e/exec-remote.spec.ts`）。
- **`runtime: runsc` 与 GPU 同时使用**：没有验证。本机（RTX 5090 两张，NVIDIA Container Toolkit 与 CDI）没有安装 runsc，也没有改 Docker 守护进程配置的权限；compose 的 GPU 覆盖配置（`deploy.resources.reservations.devices`）实测可用（容器中 `nvidia-smi -L` 列出两张卡，与 `cap_drop: [ALL]`、`no-new-privileges` 同时）。按约定模板不提供两者的组合：`compose.gpu.yaml` 与 `compose.gvisor.yaml` 是分开的覆盖配置，说明中写明不组合；`compose.gvisor.yaml` 只经 `docker compose config` 校验。
- **另外发现**：Rollup 会加载死分支中的动态导入，网页的服务端渲染因此也打包插件的浏览器模块，`@jupyterlab/services` 的 `require('ws')` 在那里没有 `browser` 字段的替换而打包失败；插件的 `vite.config.ts` 把它解析为该包自己的垫片（`architecture.md` 4.6 节 WP-76 的段落）。docker-stacks 镜像中内核继承容器的环境，读得到 `JUPYTER_TOKEN`：compose 模板是单用户服务器，学习者之间的隔离要用 JupyterHub（模板说明中写明）。devcontainer 命令行以清理过的环境运行，指向 compose 的开发容器定义要经 `settings.presmium.exec.passEnv` 传入 `JUPYTER_TOKEN`，之后本地环境插件可以在其中运行代码。
**WP-85 开始时的验证（2026-10-16，myst-parser 1.7.4、myst-ext-card 1.0.9、myst-ext-grid 1.1.1、myst-ext-tabs 1.0.10、myst-ext-button 0.0.2、Slidev 53.0.0、VitePress 1.6.4）**的结论：

- **登记**：四个包导出的指令与角色规格（`cardDirective`、`gridDirectives`、`tabDirectives`、`buttonRole`）直接放进 `mystParse` 的 `directives`、`roles` 选项即可，嵌套的 `::::{grid}` 中的 `:::{card}`、卡片正文中的 `+++`（页脚，`blockBreak`）与 `^^^`（页眉）、卡片标题中的行内 MyST 都按 mystmd 的规则读出。myst-parser 对同名规格取先登记的一个，所以这些规格排在插件的指令之前。四个包都是 MIT，与 myst-parser 同一发行（`myst-common` 1.10.1、`myst-directives` 1.7.4），不引入新的传递依赖。
- **mdast 与设计的出入**：`{grid-item}` 生成的节点类型是 `grid-item`（不是 `ir.md` 原写的 `gridItem`）；``{button}`文字 <地址>` `` 生成带 `class: 'button'` 的 `link`（不是 `kind: 'button'`），没有地址时是带同样类名的 `span`；`tabItem` 的标题是字符串字段 `title`，卡片的链接是 `card.url`，栅格的列数是 `grid.columns`（1 到 4 个 1 至 12 的整数，缺省 `1 2 2 3`）。IR 保留这些节点的原样，`ir.md` 2.10 节按实际改写；没有改契约（`ir.ts` 不涉及这些 mdast）。
- **幻灯片**：`lowerMyst` 把栅格与卡片写成带类名的 HTML 块（`<div class="pm-grid" style="--pm-grid-columns: 3">`，每个开闭标签单独成块，中间空行），Slidev 的 Markdown 照常解析其中的 Markdown 并编进 Vue 模板；幻灯片的画面宽度固定，列数取最宽一档。渲染端只给 `lowerMyst` 传 `iframes: 'element'`（`render-slides/src/node/slidev.ts` 不在 WP-85 的归属中），所以选项 `cards` 不写时随 `iframes`：`element` 的渲染端（幻灯片）保留结构，其余（notebook）写成小标题加段落并列为降级。
- **网页**：VitePress 默认主题给 `.vp-doc` 中的外链的 `::after` 设了宽、高与图标遮罩，整张卡片的链接（标题链接的 `::after` 覆盖卡片）要以更高的优先级重设它们；`.vp-doc p` 的外边距同样压过单个类名的选择器。选项卡的标签与面板的 id 用 Vue 3.5 的 `useId()`，服务端渲染与水合一致。
**WP-88 开始时的验证（2026-10-16，Slidev 53.0.0、VitePress 1.6.4、Playwright 1.64.1）**的结论：

- **子块在插槽中**：IR 运行时把组件的子块作为默认插槽交给组件，每个子块是一个以块 ID 为 `key` 的节点（`@presmium/viewer` 的 `ComponentView`），所以 `PmPredict` 按属性 `reveal`、`notes` 中的 ID 把补充说明与揭示内容分开，读者视图中保存预测之前不渲染揭示内容（DOM 中没有它），放映与演讲者视图照常交给子块按步骤显示，只去掉移入的讲解。幻灯片形态的插槽是渲染端写出的 Slidev Markdown，节点没有块 ID：组件把整个插槽放在作答区之后，揭示内容由渲染端包上的 `<div v-click="<步>">` 控制。构建产物中验证过：组件插槽中的 `v-click` 按幻灯片的绝对步数出现（第 0 步隐藏、第 1 步显示），移入的讲解由渲染端照常写进演讲者备注。
- **网页的服务端渲染**：插件组件在挂载之前显示它的 `fallback`（`packages/web` 的 `clientOnly`），所以 `fallback` 中的揭示内容放在关闭的 `<details>` 中，不会在挂载之前直接显示；挂载后组件取代它。
- **课堂服务的写入规则**：学习者的写入只要键按 `:` 分开后含自己的参与者 ID、值的 `participant` 是自己即可（`packages/classroom-server`），`predictions` 集合以 `<章节>/<块>:<参与者>` 为键，不需要改服务端。
- **未覆盖的地方**：网页演讲者视图的讲解列表与滚动叙事视图的讲解轨只读章节顶层的讲解块。移入 `PmPredict` 的讲解因此不在演讲者视图的讲解列表中，在滚动叙事视图中也不在讲解轨上，而是保存预测后显示在舞台上的组件里（放映画面与幻灯片的演讲者备注不受影响）；由 `@presmium/viewer` 按 `irBlocks` 读取讲解即可补上，留给验收者决定（交付报告中列出）。
**WP-77 开始时的验证（2026-10-16，Mediabunny 1.61.3、Playwright 1.64.1 的 Chromium 与 Firefox，假麦克风与假摄像头；WebKit 在本机无法启动）**的结论：

- **Ogg/Opus 录音**：Mediabunny 的 `MediaStreamAudioTrackSource`（WebCodecs 的 `AudioEncoder`，`codec: 'opus'`）加 `OggOutputFormat`（`maximumPageDuration: 1`）与 `StreamTarget`，在 Chromium 与 Firefox 中都可用：`canEncodeAudio('opus')` 为真，4 秒的录音得到时长为 4.0 秒左右、可以跳转（`seekable` 为整段，跳到 2 秒后 `currentTime` 为 2）的文件；写入全部按顺序追加（每个块的位置等于此前的长度），开始 2 秒时已有数据写出，所以每 5 秒上传一块、在服务端按位置写入即可。码率用 `new Quality({ bitrate: 24_000 })`（`new Quality(24000)` 的数字是质量系数，Chromium 报“Infinity bps 不支持”）。Firefox 的假设备不应用 `echoCancellation`、`noiseSuppression`（`getSettings()` 为 false），Chromium 应用。
- **MediaRecorder 的退路**：两种浏览器的 `audio/webm` 录音时长都是 `Infinity`，Firefox 中还不能跳转；Chromium 不支持 `audio/ogg`，Firefox 支持。所以只在浏览器没有 Opus 的 `AudioEncoder` 时退回 MediaRecorder（优先 `audio/ogg`，其次 `audio/webm`、`audio/mp4`），讲授轨的 `audio[].duration` 取录制时的时钟，回放的时钟不依赖文件报告的时长；不做 WebM 的时长修正（重新封装）。Safari 26 的 WebCodecs Opus 编码没有实测（WebKit 在本机无法启动），由验收者或 WP-89 在 macOS 上补做；不可用时 Safari 走 MediaRecorder 的 `audio/mp4`。
- **摄像头与屏幕**：`MediaStreamVideoTrackSource`（`getFirstEncodableVideoCodec` 选出 VP9）加 `WebMOutputFormat` 在两种浏览器中得到时长正确、可以跳转的 WebM；收尾时回到文件开头改写头部（写入不按顺序），所以上传的每一块带位置，服务端按位置写入（只允许改写已有的部分或在末尾追加）。
- **回放**：无头 Chromium 中 `<audio>` 在点击“播放”后正常播放（假的音频输出），2 倍速时媒体时钟一秒走约 1.94 秒；播放被拒绝时时钟退回页面时钟（`MediaClock`），回放照常进行。
**WP-78 开始时的验证（2026-10-16，`@modelcontextprotocol/server` 与 `@modelcontextprotocol/client` 2.3.1（协议版本 2026-07-28）、Node 22.22、Playwright 1.64.1）**的结论：

- **HTTP 的挂载**：v2 的 `createMcpHandler(factory, options)` 返回 `{ fetch, notify, bus, close }`，`fetch(request, { authInfo })` 是 Fetch API 的处理函数，`authInfo` 原样交给工厂（可以是异步的），工厂为每个请求新建一个服务器实例，没有会话。服务端已经以 `@hono/node-server` 把 Node 的请求转为 Fetch，并自己校验 `Host`、`Origin` 与令牌，所以挂载时用不到设计中列出的 `@modelcontextprotocol/node`（它提供的正是 Node 的转换与这两项校验）；校验过的成员与模式经 `authInfo.extra` 进入工厂，工具的范围因此由令牌决定。
- **订阅与通知**：SDK 的客户端默认用 2025 年的握手（`initialize`，协商到 `2025-11-25`），工具与资源照常可用；2026-07-28 的 `subscriptions/listen`（`client.listen({ resourceSubscriptions })`）要求客户端以 `versionNegotiation: { mode: 'auto' }` 连接，否则本地报 `METHOD_NOT_SUPPORTED_BY_PROTOCOL_VERSION`。服务端必须声明 `capabilities.resources.subscribe`，否则 `honoredFilter` 为空，`notify.resourceUpdated(uri)` 发出的更新永远收不到（实测一直等待）；声明之后订阅者收到带 `subscriptionId` 的 `notifications/resources/updated`。2025 年的客户端在无状态的服务中没有接收通知的通道（GET 得到 405），`resources/subscribe` 对它们不可用；DeepSeek Harness 不读资源，照常用 `get_position`。
- **输入的 JSON Schema**：`fromJsonSchema(schema)` 让插件的 `AgentTool.input`（JSON Schema）直接作为工具的输入，SDK 以 JSON Schema 校验，不需要 zod；返回 `isError: true` 的结果到达客户端时是错误结果，不是协议错误。
- **stdio**：`serveStdio(factory)`（`@modelcontextprotocol/server/stdio`）用同一个工厂提供 stdio，客户端的 `StdioClientTransport` 以两种协议都能连接。
- **放映视图中的确认**：网页形态的放映视图是 `position: fixed; inset: 0; z-index: 1000` 的覆盖层，盖住了 VitePress 导航栏中的工具栏，工具栏的确认入口在放映视图中显示却点不到（Playwright：`pm-present__slide … intercepts pointer events`）。确认同时发往该成员的全部窗口，所以 `e2e/mcp.spec.ts` 在作者的另一个窗口（文档视图）中回答；在放映视图的控制条中加入确认入口属于 `viewer` 与 `host`，交给验收者（`architecture.md` 10.2 节）。
- **共用的搜索**：`@presmium/mcp` 依赖 `@presmium/web` 以复用 `searchDocuments` 与 `tokenize` 会使 pnpm 的符号链接成环（`web` 的开发依赖有 `cli`，`cli → server → mcp`），所以 `search` 用 `@presmium/viewer/domain` 的 `chapters`、`blockText` 与 `minisearch` 按同样的文档、分词与参数建立索引，分词函数是副本。
- **复查后的补充（交给验收者）**：设计的资源 URI 不含文档，`presmium serve` 有多份文档时读不到一份文档的资源，所以每个文档资源另有带 `?document=<目录>` 的资源模板（SDK 的 URI 模板把查询参数当作必需的，所以不带参数的 URI 仍单独登记）；`compile: off` 是整个工作区的设置，任一文档为 `off` 时都不列出 `run_code`。`@presmium/mcp` 依赖 `@presmium/viewer`（只用 `./domain`）使服务端的安装带上浏览器运行时的依赖（vue、mermaid、shiki 等），第 3 节的依赖表也因此允许 `mcp` 用 `@presmium/viewer/domain`；把 `chapters`、`blockText`、`tokenize` 与 `searchDocuments` 移到不带浏览器依赖的位置由验收者决定。
**WP-79 开始时的验证（2026-10-16，VitePress 1.6.4 与其 Vite 5.4.21、simple-git 4.0.2、oauth2-proxy 7.12.0、Docker Compose 5.1、`node:22-trixie-slim`）**（`wbs.md` 没有为 WP-79 列出先行验证，开始时做了这几项小规模实测）的结论：

- **工作区站点的开发服务器**：每份文档一个 VitePress 开发服务器（`base` 为 `/<文档目录>/`，与单份文稿的网页形态同一套生成的项目），首页另一个 VitePress 项目，前面是网页渲染端自己的路由：按路径中最长的文档目录转发，HTTP 与 HMR 的 WebSocket 都是（Vite 5 的 HMR 路径就是 `base`），文档的开发服务器在它第一次被请求时以 `compile` 给出的 IR 启动。经 `presmium serve` 转发并保留浏览器的 `Host` 时，Vite 5.4.12 起的主机检查拒绝请求，所以站点的开发服务器设 `server.allowedHosts: true`（它们只监听本机，或 agent-host 在 `agents` 网络上的地址）；生成的项目不在工作区中（在 serve 或 agent-host 自己的缓存目录中），所以 `server.fs.allow` 列出项目、文档目录、插件与 Presmium 的包。VitePress 1.6 的命令行不接受 `--port 0`（回落到 5173 并递增），所以先在本机取空闲端口再传给它。serve 自己回答 `/__presmium/`，所以开发服务器的 IR 端点改在文档的 `base` 下（`<base>@presmium/ir`）。在页面打开时改动源码，经 serve、路由与 HMR 的推送照常到达页面。
- **VitePress 的数据加载器**：文稿组件引用的 `*.data.ts` 在开发服务器的 Node 进程中运行 `load()`，时机是浏览器请求这个模块（实测经 `/<文档目录>/@fs/<路径>` 请求即运行），所以 SHARED 中它运行在 agent-host 启动的 VitePress 子进程中，父进程链上没有 serve。
- **git**：simple-git 4 拒绝 `-c core.hooksPath=…` 与 `-c core.fsmonitor=…`，除非打开它的 `unsafe.allowUnsafeHooksPath`、`allowUnsafeFsMonitor`；工作区只以这两个开关传入自己的常量配置（另加 `commit.gpgSign=false`）。revert 进行中 `git commit -- <路径>` 被拒绝（partial commit），所以撤销提交整个索引；冲突时 `git revert --abort` 使工作树复原，冲突的文件取自 `git diff --diff-filter=U`，本地改动挡住的文件取自 git 的提示。
- **编译器**：`{literalinclude}` 不被展开（myst-parser 给出 `literal: true` 的 `include` 节点，编译器只展开 `{include}`），所以它什么也不读、也没有诊断；指向工作区之外的符号链接经 `{include}` 读取时给出 `presmium.files`。（WP-79e1 起编译器展开 `{literalinclude}`，它同样经读取范围。）以 `remote` 执行时编译器仍在 serve 中调用执行插件的 `supports` 与 `fingerprint`：Python 执行器以 `python3 -c 'import sys…'` 探测版本，所以 serve 会启动一次 Python 子进程，只是不运行文稿的代码（运行器）。运行器在运行期间设置 `MPLBACKEND`，它出现在录制的环境中。
- **确认策略**：服务端的确认策略按种类生效，`approvals.operate: allow` 也会放行编译确认，所以 SHARED 且 `compile: approve` 时工作区把交给服务端的 `operate` 改为 `ask` 并记日志。
- **compose**：`node:22-trixie-slim` 的 glibc 为 2.41，没有 Python 与 git（镜像另装）；compose 的文件型 `secrets` 以主机文件的属主与权限挂载，主机上 0600 的文件在容器中只有 root 可读，正合“以 root 读取后降权”。oauth2-proxy 只能经 alpha 配置添加固定的请求头，所以模板以它在 `edge` 上的固定地址让 serve 信任它（`--trust-proxy-from`），共享密钥仍可用于其他登录代理。镜像的构建上下文是已 `pnpm install` 的检出（pnpm 的符号链接都是相对的），`.dockerignore` 不能写 `**/dist`（会去掉依赖包自己的 `dist/`）。

**WP-90 开始时的验证（2026-10-16，deltabox-lite 0.1.1（npm 包与 `deltabox-lite-linux-x64`）、Node 22.22；Linux 7.0、x86_64、ext4、glibc 2.39、Landlock ABI 8、`/dev/fuse`）**的结论：

- **Node 绑定**：`loadNative()` 在只有 `PATH`、`HOME` 与 `DELTABOX_STATE_DIR` 的进程中能加载（约 5 ms）。`NativeDeltabox` 的构造参数里项目目录是固定的，所以每个项目（文档目录、运行目录）一个实例；`startSession` 的策略是 TOML 文件的路径，会话的每次操作都重新读它。cbcow-through 以 `require_fs_mode` 启动约 70 ms，`isolation_provider` 为 sandlock，会话信息中没有 `degraded_protections`；预热会话中一次 Python 运行约 50 ms，`abort` 约 1 ms，停止约 130 ms。
- **可用性的判断**：辅助进程在临时项目上以 `require_fs_mode` 启动会话、检查 `degraded_protections`，再 `exec` 一次 `true`（sandlock 能启动命令），约 250 ms；经 jiti 启动 TypeScript 的辅助进程约 310 ms。结果按开机与包的版本缓存，满足条件的主机在同一次开机中不再探测。
- **进程**：deltabox 的文件系统 helper、命令 helper 与 sandlock worker 都是调用绑定的进程的子进程（不脱离为守护进程），会话的命令是 worker 的子进程并属于 worker 的进程组；它们的命令行含会话 ID 的目录，所以能按会话找到。被执行的代码沿父进程链只读得到 worker（环境里只有辅助进程的三个变量），再往上与 `/proc` 中其他进程的环境都读不到；连 `127.0.0.1` 的监听器与 Docker 的套接字都得到 `PermissionError`，写文稿目录得到 `PermissionError`。
- **绑定的细节**：`exec` 没有取消，超时与中止要由调用者结束 worker 之下的进程（`exec` 随即返回，`exit_code` 为 null，worker 保持预热）；`readFile` 拒绝穿过符号链接的路径（`path crosses a symlink`）；`writeFile` 会建立中间目录，写入进入日志，`abort` 把它删除；直接写在会话背后的项目目录中的文件不进日志，`abort` 不删。`stopSession` 之后会话的运行时目录（`/tmp/deltabox-<uid>/deltabox-lite/<会话>/`）与项目在 `projects/<路径的 SHA-256 前 16 位>/` 的登记留在原处。检查点到 105 个时 `diff --from` 第一个仍可用（设计仍按 100 个处理）。
- **审阅**：不在沙箱中的进程（测试与 agent 的写法）经视图的写入出现在 `diff` 中，`abort` 恢复它们并删除新建的文件；同一项目再开会话得到 `session busy`；结束整个进程树（插件的进程、辅助进程与 deltabox 的 helper）之后，另一个进程以记录的会话 ID 对同一项目 `abort` 恢复了文档目录（helper 由 deltabox 从日志重新启动）。
- **macOS**：没有主机，没有验证；插件在 macOS 上不探测也不登记（第 43 条），由 WP-89 补做。

**WP-82 开始时的验证（2026-10-16，火山引擎文档 6561/1598757（HTTP 分块合成 V3）、6561/1631584（极速版识别）、6561/1354868（录音文件识别的字段）；FFmpeg 7.0.2（libavformat 61）；本机没有语音凭据）**的结论：

- **GB 45438 的隐式标识**：字段为 `Label`（生成合成服务自己写 `"1"`；`"2"`、`"3"` 是传播平台的“可能”“疑似”）、`ContentProducer`、`ProduceID`、`ReservedCode1`、`ContentPropagator`、`PropagateID`、`ReservedCode2`，字符串结构为 `AIGC={…}`（阿里云 AIGC 音频标识指南、腾讯云 API 文档；火山引擎合成接口的 `additions.aigc_metadata` 用同一组字段：`content_producer`、`produce_id`、`content_propagator`、`propagate_id`）。TC260 2025-08-28 采纳的《文件元数据隐式标识（音频文件）》实践指南按格式规定了存放位置，但正文只在征求意见稿的压缩包中，这里没能读到原文，以下写法要由验收者对照指南确认。定稿：WAV 在 `LIST`/`INFO` 块中写子块 `AIGC`（字段的 JSON）与 `ICMT`（`AIGC={…}`）；Ogg/Opus 在注释头（`OpusTags`）中加注释 `AIGC={…}`，注释头跨页时重排它的页，其后各页只改页序号与校验和；MP4（WP-83 的导出）用 FFmpeg 的 `-metadata AIGC=… -movflags use_metadata_tags`（`moov/meta` 的 `mdta` 键）。三种格式中 `ffprobe` 都把它读成名为 `AIGC` 的标签（WAV 的 `ICMT` 另读成 `comment`），标识之后的文件照常解码，假引擎的 `pmfk` 块与 Opus 的音频页不变。WP-82 的验证另以 FFmpeg 7 核对了 WAV、单页注释头与跨页注释头（约 70 KB）的 Ogg：`AIGC` 都能读出，标识后的文件解码无误、时长不变；与 TC260 指南原文的对照仍待验收者。`ContentProducer` 写引擎的服务提供方，`ProduceID` 写合成缓存的键，传播方的两项留空。
- **火山引擎**：合成用 HTTP 分块接口，响应是逐行的 JSON：`data` 为 base64 的音频片段，`sentence.words` 为字幕（`startTime`、`endTime`，秒，字幕的字是原文），`code: 20000000` 结束；`enable_subtitle` 只在 2.0 模型上有效，开启 SSML、`enable_latex_tn` 或服务端缓存时没有字幕；新控制台的密钥只要 `X-Api-Key`，旧控制台是 `X-Api-App-Id`（合成）或 `X-Api-App-Key`（识别）加 `X-Api-Access-Key`，所以 `PRESMIUM_SPEECH_VOLCENGINE_APPID` 是可选的（有它时按旧控制台）。极速版识别直接上传 base64 的音频（WAV、MP3、Ogg/Opus），状态在 `X-Api-Status-Code`（`20000003` 是静音），热词经 `request.corpus.context` 的 `{"hotwords":[…]}` 传入，`audio.language` 留空时识别中英文与方言。适配器以本机的模拟服务按文档的示例响应核对了请求头、请求体与解析。中英混说的转写效果没有实测（没有凭据）：`packages/addon-speech/test/engines.test.ts` 的火山引擎用例合成并转写一句中英混说的话，并打印转写结果，由验收者在有凭据时运行。
- **Safari 26 录制 Ogg/Opus**：本机不能启动 WebKit（同 WP-77），没有实测，由验收者或 WP-89 在 macOS 上补做。
**WP-80 的先行验证（2026-10-16，DeepSeek Harness `@deepseek-ai/dsh` 0.2.1-alpha.4（与 `vendor/docs/dsh` 同一版本）、`@agentclientprotocol/sdk` 1.8.0、Node 22.22；ACP 客户端驱动真正的 `dsh --profile acp`，模型是测试起的 Messages 兼容服务）**的结论：

- **配置项 ID**（`dsh --profile acp --dump-default-config`）：会话日志上传 `session-log-deepseek`（默认开启，随官方地址与经 gateway 的请求发出），会话遥测 `session-telemetry-otel`（`mode` 默认取 `DSH_TELEMETRY_MODE`，否则 `FEEDBACK_ONLY`），请求另带插件清单 `plugin-package-inventory-deepseek`；三份模板都关闭这三行。shell：`tool-bash`、`tool-pwsh`；命令执行：`tool-jobs`（后台命令）、`ptc-runtime`、`workflow-ptc`、`tool-workflow`（模型写的程序与工作流）、`tool-subagent`、`tool-subagent-fork`、`tool-subagent-control`、`tool-subagent-list-agents`；联网：`web`、`web-search-deepseek`、`web-fetch-http`、`tool-web`；文件：`tool-fs`（`read`、`read_image`、`write`、`edit`，各有开关）与只读的 `tool-fs-search`。沙箱与询问：`sandbox-policy`（`mode` 默认取 `DSH_PERMISSION_MODE`，模板写死）与 `approval`（`policy`）。补丁行替换整个 `config`，`disabled: true` 关闭一行。沙箱的后端 `bash-sandbox`、`pwsh-sandbox` 不能关：权限预设 `permission` 要它们提供的 `shell`，没有时启动报“1 entry did not activate”；`read-only` 加 `never` 不对应任何权限预设，预设插件启动失败，所以 `presmium-tutor` 用 `read-only` 加 `ask`，由助手拒绝问答的全部权限请求。实测三份模板下 agent 拿到的工具：`presmium` 有 `bash`、`write`、`edit`、`web_fetch`、`web_search`、`workflow`、`subagent` 等；`presmium-shared` 只有文件、搜索、计划与目标类工具与 MCP 工具；`presmium-tutor` 另没有 `write`、`edit`（调用时得到 `unknown tool`）。
- **调用 MCP 工具前是否询问**：不询问。`workspace-write` 加 `ask` 下，模型调用 `mcp__presmium__get_section` 时 DeepSeek Harness 直接调用，没有 `session/request_permission`；确认的关口只能在我们的 MCP 服务中（已是如此，WP-78）。会话开始时它对 HTTP 的 MCP 服务依次发出 `server/discover`（探测）、`initialize`、`notifications/initialized`、一次 GET 与 `tools/list`，都带 `mcpServers` 中给出的 `Authorization`。
- **权限请求**：`workspace-write` 下写 `cwd` 之内的文件不询问；写之外的文件先被沙箱拒绝，模型被告知可以带 `sandbox_permissions` 与理由重试，重试时才发出 `session/request_permission`，其中只有工具调用的 ID（`toolCall: { toolCallId }`），没有标题、输入与位置，选项是 `allow-once`（`allow_once`）与 `reject-once`（`reject_once`）；所以助手按先前的 `tool_call` 更新分类。`workspace-write` 还允许写 DeepSeek Harness 的临时区域，实测 `/tmp` 之下的路径不询问就写入（`architecture.md` 9.4 节）。拒绝后模型得到“the user rejected escalating …”。
- **`DEEPSEEK_BASE_URL` 指向别处时的请求**：`POST <DEEPSEEK_BASE_URL>/v1/messages`，`stream: true`，请求体有 `model`（默认 `deepseek-v4-flash`）、`messages`、`max_tokens`、`thinking`、`output_config`、`system`、`tools`；密钥只在 `x-api-key` 中，没有 `Authorization`。gateway 只认 `Authorization: Bearer`，所以 SHARED 中 agent-host 为每个会话起一个本机回环上的转发，把 `x-api-key` 改为 `Authorization`（`architecture.md` 4.8 节）。Anthropic 格式的 SSE（`message_start`、`content_block_*`、`message_delta`、`message_stop`，文字或 `tool_use`）即可应答，提交的消息以一整段 `agent_message_chunk` 到达，工具调用以 `tool_call`（`kind` 一律 `other`，`rawInput` 是输入）与 `tool_call_update` 到达。
- **其他会把凭据带走的地方**：网页搜索 `web-search-deepseek` 带着 `DEEPSEEK_API_KEY`（同时以 `x-api-key` 与 `Authorization`）访问自己的地址（默认 DeepSeek 的官方地址，只读 `DEEPSEEK_SEARCH_BASE_URL`，不看 `DEEPSEEK_BASE_URL`），所以 LOCAL 中用 `PRESMIUM_MODEL_*` 时助手另把 `DEEPSEEK_SEARCH_BASE_URL` 设为运营者服务的 `/v1`。`$DSH_HOME/.credentials.yaml` 中存储的凭据先于环境变量，`$DSH_HOME/cordis.patch.yml` 在 profile 之上生效，所以助手给 DeepSeek Harness 一个 Presmium 自己的 `DSH_HOME`。出站请求遵守 `HTTPS_PROXY`（本机回环除外），测试以此确认只有假密钥时没有请求发出。
- **启动与其他**：第一次在一个 `DSH_HOME` 中启动时初始化 `profiles/acp`，之后 `initialize` 约 0.6 秒、`session/new` 约 0.1 秒（含连接 MCP 服务）；`initialize` 的 `agentInfo` 是 `{ name: 'deepseek-harness-acp', version: '0.0.1' }`（ACP 桥的版本，不是 DeepSeek Harness 的）；它声明 `sessionCapabilities.close`。`--patch` 的路径要写绝对路径（相对路径相对于进程的 `cwd`，而 `cwd` 是会话的目录）。安装脚本（`node-pty`、`koffi`、`@deepseek-ai/dsh-subprocess-local` 等）不运行时 Linux 上 ACP、shell 与文件工具照常（`node-pty` 有随包的预编译二进制）；整个依赖约 860 MB（npm 安装）。
- **Node 22.19**：本机 Node 22.22.1；`@deepseek-ai/dsh` 的 `package.json` 没有声明 `engines`，22.19 的要求出自它的文档（`docs/development.md`）。根目录的 `engines`（`>=22.18`）提高到 `>=22.19` 由验收者在合并时修改（交付报告中提出）；K2 波次（WP-89c）把根目录、`@presmium/cli` 与助手插件的 `engines.node` 都设为 `>=22.19`。

**WP-87 开始时的验证（2026-10-16，myst-parser 1.7.4、VitePress 1.6.4、Slidev 53.0.0）**的结论：

- **MyST 的指令错误**：myst-parser 把应用失败的指令换成 `mystDirectiveError` 节点（`message` 如 `required body not provided for directive: csv-table`，`options` 保留作者写的选项），角色同样有 `mystRoleError`；不认识的选项（如 `{csv-table}` 的 `:file:`、`{note}` 的 `:badoption:`）只是给 vfile 的警告，编译器读不到。所以 `presmium.directive` 由这两种节点给出，并按 myst-parser 的 `defaultOptions.directives` 列出该指令不接受的选项，作为可能的原因。
- **产物中的文字**：VitePress 与 Slidev 的构建产物（页面、JavaScript 块、搜索索引）、notebook 与 `ir.json` 中的中文是 UTF-8 原文，不转成 `\u` 转义；高亮的代码被拆进 `<span>`，JSON 与 JavaScript 字符串中的引号与换行是转义。泄漏扫描因此还原转义与字符引用、另去掉标签读一遍，按每段文字（而不是整段拼起来的文字）分句。搜索索引（MiniSearch）只存小写的词，测试用 ASCII 的标记词检查它。
- **工作区站点中的模块**：每份文档的 VitePress 开发服务器以 `/<文档目录>/` 为 `base`，页面加载的 IR 模块是 `/<文档目录>/@id/__x00__virtual:presmium/ir`（`export default JSON.parse("…")`），搜索索引是 `/<文档目录>/@localSearchIndexroot`；经 `presmium serve` 按成员转发后读者与编辑者请求同一地址得到各自视图的内容。
**WP-83 的先行验证（2026-10-16，`@mediabunny/server` 1.61.6（依赖 `node-av` ^6）、`@seydx/node-av-linux-x64` 6.1.1、Mediabunny 1.61.3、Playwright 1.64.1 的 Chromium）**的结论：

- **`@mediabunny/server` 的 FFmpeg 是 GPL**：包本身是 MPL-2.0，`node-av` 与各平台的二进制包标为 MIT，但二进制 `node-av.node` 静态链接的 FFmpeg 的配置串（二进制中可读）是 Jellyfin 的构建，带 `--enable-gpl --enable-version3`，并链接 `libx264`、`libx265`（GPL）与 `libfdk-aac`。按工作包的规定，`presmium-lecture export` 只导出 WebM：在 Chromium 页面中用 Mediabunny 的 WebCodecs 路径（`CanvasSource` 的 VP9，没有时 VP8；`AudioBufferSource` 的 Opus）合成，不依赖 `@mediabunny/server`，不导出 MP4（`--out` 不是 `.webm` 时用法错误并说明原因）。WP-82 为 MP4 定下的 `AIGC` 写法因此不用；WebM 的标识写在 Matroska 的标签中：`COMMENT` 为 `AIGC={…}`，另有名为 `AIGC` 的标签（字段的 JSON），Mediabunny 读回为 `comment` 与 `raw.AIGC`（`packages/addon-lecture/test/video.test.ts`）。
- **逐帧导出**：播放器的导出模式（地址加 `&export`，没有控件）由导出者调用 `window.presmiumLecture.advance(t)` 逐帧推进（事件按时间应用，同播放，不重放折叠），每帧截图（JPEG）后交给另一个页面编码；无头 Chromium 的 `VideoEncoder`（VP9）与 `AudioEncoder`（Opus）可用，`OfflineAudioContext.decodeAudioData` 解码假引擎的 WAV 与录制的 Ogg/Opus。10 秒的讲授以 5 帧每秒、960×540 约 10 秒导完（构建网页另需约 20 秒）；导出的时长是帧数除以帧率，比讲授轨长不到一帧，音轨同长。

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
