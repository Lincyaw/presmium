# MCP 规范作者事务首片验证

2026-10-27，正式 MCP 客户端和工作区服务在隔离小文稿中完成 canonical read → plan → apply → readback。HTTP 和 MCP 共用同一个 `DocumentEditor`；没有请求模型、转写、合成或公共 Studio。本文记录首片实际运行，完整能力目标见 [MCP 作者动作 RFC](../rfc-mcp-authoring-actions.md)。

## 输入与运行边界

从工作区默认 `lecture.json` 模板创建临时单文稿，使用真实 git 仓库、普通正文和工程文本文件。正式 `serveWorkspace` 监听 `127.0.0.1` 的随机端口，MCP 使用公开 SDK `Client` 与 `StreamableHTTPClientTransport`；独立 stdio 运行正式 `presmium-mcp`。每个服务使用脚本新生成的临时 launcher 授权，并由官方会话令牌接口签发 MCP 会话授权；没有读取现有凭据文件，原始记录不输出令牌。

临时编译插件通过正常插件包入口加载，实际执行四秒编译 pass、产生诊断及贡献 `slow_echo` 工具。它用于检查编译和作者事务是否互相等待，没有 mock 宿主或语音引擎。脚本结束关闭全部 MCP 客户端及服务，并删除临时文稿。

本地原始记录位于忽略目录 `.presmium/mcp-authoring/`：`consumer.mjs`、`consumer-result.json`、`slow.mjs`、`slow-result.json` 及源码 manifest。`source-manifest-authoring-run.json` 保存 9+5 消费者所读 14 个源码文件的 SHA-256，结束后核对全部保持一致。随后仅 `server/src/mcp-host.ts` 修正可选 ServerHost 探测，最终摘要及补充验证说明记录在 `source-manifest.json`。共享文件包含另行负责的 jobs／transcription 改动，未将它们算为作者动作实现。这些是本次真实消费者运行的材料，不是新建的 tracked tests，也不进入公开文稿。

## 实际通过的场景

| 场景 | 观察到的结果 |
| --- | --- |
| 独立 stdio 能力 | `available:false`、reason 为 host-unavailable；不暴露 apply 工具 |
| workspace 能力 | read／plan／apply 可用；明确 16 文件、2 MiB 文本及进程内幂等边界 |
| 作者 HTTP 鉴权 | host-level document 路由无 launcher token 返回 401；带临时授权可读取且不编译 |
| 只读预检 | 返回候选、影响和三个文件的预测版本，磁盘文稿未改变 |
| 原子提交与来源 | 一次保存正文、发音讲稿、修改工程文件及新建工程文件；回执有 commit，来源为 agent |
| 跨入口幂等 | 相同请求由 HTTP 与 MCP 重试，返回相同保存版本和 commit；没有第二次提交 |
| 旧源与意图冲突 | HTTP 后续保存被 MCP 读到；旧请求重试返回结构化 409；成功意图换 payload 被拒绝 |
| 工程文件 CAS | 预检后外部修改工程文件，apply 拒绝整次操作，文稿与外部内容均保留 |
| 实际提交失败恢复 | 在隔离仓库建立 index.lock，真实 git add／提交失败；已写 JSON 和工程文件恢复，新建文件删除，已有历史保留 |
| 非法实体引用 | 预检返回 422、字段 issues，文稿版本不变 |
| 坏编译修复 | 缺失插件产生实际编译错误后，MCP 仍可读取、预检和保存有效源修复 |
| 初次连接独立编译 | MCP 初始化、canonical read、当前诊断资源与 HTTP read 没有启动 compile pass；诊断初始为 version 0，不当作已验证 |
| 慢编译中的作者操作 | 四秒实际编译进行时，另客户端初始化、read、plan 及 HTTP read 在 68.53 ms 完成 |
| 插件工具就绪 | 显式编译完成后，readyTools 包含真实 slow_echo，可由正式 MCP 调用；初次作者读取不等待它 |
| operate 关闭 | 能力响应 apply:false、operation-disabled，与实际工具列表一致 |
| required review | 能力响应关闭 apply；已确认会话也得到 authoring-review-required，源版本不变 |

消费者主链 9 组场景与慢编译／策略链 5 组场景全部通过。表中将部分组合场景展开说明，不把每次断言单独计算为测试。

## 本次耗时

| 操作 | 本次样本中位数 |
| --- | ---: |
| get_authoring_capabilities | 19.03 ms，单次 |
| get_document | 13.93 ms，8 次 |
| plan_document_change | 26.14 ms，7 次 |
| apply_document_change | 47.91 ms，7 次，含复用与拒绝 |

主消费者从启动 stdio 到完成全部请求为 2638.39 ms。另一慢编译消费者的初次 MCP 初始化、读取和 HTTP 读取共 321.58 ms；实际四秒编译期间的另一个客户端初始化和作者请求共 68.53 ms。这些是单轮环境观察，用于确认作者操作没有等待编译，不能推算为大型工程的延迟上界。

## 结构检查与未验证范围

已通过对应源文件的类型检查、分层检查、技能一致性检查及 diff 空白检查。没有新建 tracked tests，没有运行 `pnpm test`、`pnpm verify`、Vitest 或 Playwright 套件，没有构建两份公开课程，也没有浏览器 UI 改动。

初次实现曾发现共享 Schema 引用被验证器处理后影响原文稿校验，已用完整 Schema 深拷贝隔离；作者 Schema 与第二份验证器只从 `@lincyaw/kernel/node` 导出，不加入 Workbench 根导出。独立复审还发现初始化和 HTTP 挂载的隐式编译等待、host-level launcher 授权遗漏、能力策略不一致、agent 历史来源和页面顺序影响遗漏，均修复后复跑上述真实链。工具清单就绪通知另使用独立 compile-ready 事件，不依赖诊断数组变化；动态工具与 dsh 的订阅验证由专门消费者记录。

两次独立源码复审最终均为 APPROVE。动态工具的独立真实 dsh 消费者完成 14 组场景，覆盖零诊断编译后工具通知、运行中旧工具批次、空闲边界替换、换文稿和销毁清理，未请求模型。可选 ServerHost 的公共 `startServer` 入口补充验证为随机端口启动并正常关闭；原始记录为 `.presmium/ui-evidence/mcp-tool-list-after.json` 和 `mcp-optional-host-review.json`。这些补充验证不扩大本片的音频或 UI 验收范围。

本片未验证设备录音、真实 ASR／TTS、候选采用、完整字幕对齐、视频同步、浏览器草稿恢复、required-review 提交流程、独立 stdio 写入或跨重启幂等。保存回执明确 compiled/runtime 为 not-requested，不将空诊断、缓存或源码检查当成这些行为已经完成。
