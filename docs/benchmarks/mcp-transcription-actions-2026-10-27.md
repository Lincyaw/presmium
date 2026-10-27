# MCP 转写任务与讲稿采用接入记录

2026-10-27，正式 MCP 客户端、实际 workspace 服务与共享转写／采用服务完成 25 组私有消费者检查。没有调用模型、ASR、TTS 或外部提供方；候选与部分历史任务使用明确标注的协议材料，不作为识别成功证据。设计与当前范围见 [MCP RFC](../rfc-mcp-authoring-actions.md#15-转写任务与采用的-mcp-接入)。

## 实际接入

| 边界 | 实现 |
| --- | --- |
| 任务归属 | workspace 启动时创建一个 `DocumentTranscriptions`，HTTP、MCP 和 compiled workspace 路由借用同一实例；仅 workspace 关闭时结束任务 |
| 采用归属 | HTTP 与 MCP 共用 `createTranscriptionAdoption` 的计划，planId 来自 `DocumentEditor`；HTTP 私有闭包固定 editor，MCP 固定 agent |
| Node 能力 | 通过公开 `Compiler.nodeServices()` 装配目标文稿服务，核对同次返回的 exact source，不执行 collect、场景或 IR pass |
| 能力反馈 | 保留 available，并返回 available／unavailable／unknown、真实装配诊断及 configuration-only；配置声明不代表鉴权成功 |
| 模型入口 | 八个 MCP 工具，启动为 spend，取消／采用为 operate，其余为 read；模型不能提交 confirmed／origin |
| Studio 代理 | 同一组六个 transcription／adoption HTTP 路由进入通用白名单，保留既有授权和转发方式 |
| 任务发现 | journal 和 active 状态产生同一任务清单；扫描最多 1025 个目录项、读取最多 1024 个，四路并发，完整 JSON 回复不超过 2 MiB |
| 文本结果 | 提供方仅返回 text 时，producer 创建稳定的无时码单 segment，保留原 text 与 timing:none；空 text 不生成片段 |

服务装配仅合并同源的进行中请求，结束后释放引用；源变化重新装配，真实插件错误不被旧能力缓存掩盖。已接收任务捕获当次 SpeechService，不随另一页面或预览重挂载替换。任务清单按一次源观察和各资产摘要共享检查，返回前再核对源；旧 UUID、坏 JSON 和音频变更不能冒充当前来源。

## 消费者与材料

消费者位于忽略目录 `.presmium/mcp-transcription/consumer.mjs`，完整结果为 `result.json`。运行使用随机回环端口、两份临时规范文稿、真实 git 历史、提交的真实 Ogg 素材和实际官方插件；本地故障插件在编译 pass 才写 marker 并抛错，Node 服务装配只写另一 marker。通过这个区别确认能力探测及采用检查没有运行动画编译。

转写提供方只声明一个随机新建的本机 audit engine，并连接到只计数、返回错误的私有 HTTP trap。运行没有发出任何请求。引擎环境变量名原本不存在，不读取旧值；finally 删除全部新增项，恢复检查为 true。首次观察曾只将这些名字放进 ServeOptions.env，而既有 Speech 实现枚举当前 process.env 名称，实际返回无引擎。失败记录保留为 `first-observation.json`，修正消费者进程环境后才获得真实配置声明，没有伪造 SpeechService。

采用与结果读取复用 `.presmium/transcription-adoption-material.mjs` 生成的协议材料。其 provider 明写 `Protocol material, not an ASR provider`，warnings 标明未执行识别，timing 为 none。原音摘要和时长仍由实际媒体服务探测、比对；不是以协议材料代替真实 ASR／TTS 验证。文本-only 分支直接调用同一个 producer 纯标准化函数，以协议输入验证没有捏造时间。

## 通过范围

| 范围 | 观察到的结果 |
| --- | --- |
| 工具与权限 | 实际八工具表有正确 read／spend／operate 元数据；独立 stdio 返回 unavailable；模型 confirmed／origin 字段被拒绝 |
| 授权与目标 | host-level HTTP 无 token 为 401；文稿绑定的 MCP 令牌不能改投另一文稿，返回 403 |
| 真实装配 | 一份文稿读到实际已声明 engine，另一份文稿没有 Speech；故障动画 pass 未运行，configuration-only 不伪称鉴权 |
| 失败与恢复 | 缺插件时返回 unknown 和真实 findings；恢复规范源后获得新版本能力；源、音频摘要和错误引擎拒绝发生在识别之前 |
| 一致请求预算 | 同一超出 32 KiB 的提示请求被 HTTP 和 MCP 都以 413 拒绝；服务和 HTTP 复用同一上限 |
| 取消和发现 | MCP／HTTP 共用持久取消意图；先于接收的取消不虚构任务；跨文稿查询隔离 |
| 清单与坏记录 | 新旧 UUID 的协议任务被区分，坏 JSON 或缺结果指针的 done journal 返回 issue；FIFO 不等写入者而被拒绝；完整 JSON 预算有显式 truncated |
| 不可变结果 | 按 exact id／revision 读取同一候选，保留协议来源和 timing:none；不会反造识别成功 |
| 采用语义 | 未决受保护发音／cue 返回 conflicts 且无 planId；明确保留后通过同一个计划提交，MCP 历史来源为 agent |
| 原子与复用 | HTTP 与 MCP 重放同一次采用返回同 commit；生产设置及 voiceSource 不变；旧候选 source 不覆盖新源 |
| 坏源控制 | JSON 损坏时仍可按 ID 列出、查询、读取结果和取消；状态标为 document-unavailable，不加载语音服务 |
| 挂载与重启 | 实际故障编译和插件 unmount／remount 不关闭共享转写服务；重启后 exact result 仍可读 |
| 审阅边界 | required review 下，即使使用已确认的 MCP 会话，采用仍被拒绝且源不变 |
| 文本-only 协议 | 非空 text／空 segments 转成稳定无时码片段；空 text 保持没有片段，没有发起识别 |

25 组检查全部通过，总耗时 3587.70 ms，配置的 provider trap 请求数为 0。结果保存运行前后 15 个关键源码的 SHA-256，全部一致；客户端、workspace、trap、临时目录和新增环境项均已清理。24 项版本保留为 `result-before-done-record-guard.json`；自审补上缺结果指针的 done 记录拒绝后，才取得最终 25 项结果。

随后独立审查发现关闭时尚在读取音频的请求可能晚于已捕获的装配集合进入 resolver。`serve.ts` 已增加同步关闭门禁：关闭开始后直接拒绝新的 Node 服务装配，原有装配仍 abort 并等待。该三行修补经独立静审通过，发生在上述运行之后，未计为第 26 项运行检查；25 项原始结果未重写。

## 验证边界

本次没有运行测试套件，没有新建 tracked tests，没有使用公共 Studio，也没有操作作者文稿。已运行针对本片的类型、分层、技能、发布结构和 diff 检查，实际结果随本次交付报告。

未验证提供方鉴权、成功 ASR、运行中提供方取消、实际麦克风采集、真实 TTS、字幕逐字对齐或完整视频导出。Studio 代理在本片核对的是实际白名单映射和共享上游协议，不代表浏览器完整录制／转写 UI 已验收。协议任务中的 done 仅属于显式测试材料，不能据此宣称任何录音已经识别成功。
