# 音色与配音作者服务

`DocumentVoiceAuthoring` 是 Web 与 MCP 共用的音色与配音作者服务，契约在 `packages/kernel/src/contracts/document-voice.ts` 和 `voiceover-execution.ts`。能力与目录读取从当前 `lecture.json` 装配实际 Node 服务，不等待正文、动画或编译 pass，也不选择配音来源、合成音频或改变讲稿。任务与试听的生成入口另需主机明确花费授权。

| 入口 | 输入 | 实际回执 |
| --- | --- | --- |
| MCP `get_voice_authoring_capabilities` | 文稿目录 | source、configuration-only、配置状态、实际引擎声明和默认引擎、已安装的 voiceover／preview 实现 |
| MCP `get_voice_catalog` | 可选 `query:{source?,engine?,lang?}` | 当前 source、实际引擎声明与 provider／bundled 目录或明确 unavailable |
| HTTP `GET voice-capabilities` | 既有文稿选择协议 | 同一能力回执 |
| HTTP `GET voice-catalog` | 可选 engine／lang | 同一目录服务的当前结果 |

入口要求编辑者权限。MCP 绑定文稿的 token 不能读取别的目标。expected source 可省略；提供时核对 UUID、version 与 fingerprint。读取前后都核对同一 canonical source，发现变更返回 `document-version-changed` 和 currentSource，不把旧目录答复归给新源。

`status=configured` 只表示实际引擎声明能合成，不证明服务认证、音色存在或生成成功。`voiceover/preview` 来自实际 `VOICEOVER_EXECUTION` 实现，不把 `VOICEOVER` 安装 marker 当作任务服务，也不证明当前讲稿已经有配音。没有服务或引擎时返回 unavailable；speech 缺失且装配有错误时保留 findings 并报告 unknown。独立编译 stdio 宿主没有工作区作者服务。

目录的 available、unsupported 与 unknown 不互换。缺少 provider rate／style 范围时不生成选项；不根据音色名字猜测能力。提供方失败保留真实错误，不退回虚构的空可用列表。配置和目录读取都不启动 ASR／TTS。

共享目录请求按实际读者计数。取消一个读者只结束自己的等待；最后一个读者离开时中止真实网络请求。成功结果保留缓存，失败或取消只移除原请求自己的条目，不影响后来新建的请求。工作区关闭取消自己持有的读取并等待实际结束；被取消的 consent 不能把目录记录为未知。原有网络上限保持 30 秒，不用延时等待代替取消。

音色继承与批量应用仍沿现有作者流程，专门的 MCP 修改动作待补。共享配音任务与试听接口见下节；剩余边界见 [作者动作 RFC](rfc-mcp-authoring-actions.md)。

真实检查与取消验证见[音色作者记录](benchmarks/voice-catalog-authoring-2026-10-27.md)。

## 配音任务与试听

Workspace 持有每文稿一个 Node owner，HTTP 与 MCP 使用同一实例；compiled contribution 只借用，不在配置 remount 时销毁任务。standalone lectureServer 使用相同工厂并关闭自有工作。`get_voiceover_status` 返回实际缓存状态、source、IR revision 和 scope target，另回显可映射的 canonical StepID。缺少或过期 IR 时明确不可用，调用方可显式读取 IR resource；任务查询与取消不准备 IR。

| MCP 动作 | 输入 | 实际反馈 |
| --- | --- | --- |
| `get_voiceover_status` | 可选 query 的 source／revision | 当前计划的声音目标、缓存状态与共享 jobs，不合成 |
| `get_voiceover_jobs` | 文稿目录 | 有限进程内任务、source、revision、sequence 与 current／old／unknown |
| `get_voiceover_job` | `query:{id}` 或 `{intent}` | 原意图／任务，允许坏 JSON 下查询，不伪造 admission 前的 job |
| `start_voiceover` | `request:{intent,source,revision,scope}` | 主机 spend 授权后启动同一任务，scope 必须来自真实 snapshot |
| `cancel_voiceover` | `query:{id}` 或 `{intent}` | 主机 operate 授权后取消；cancelling 保留至实际停止 |
| `quote_voice_preview` | revision、voice、mode，可选 source／target | 实际文字、提供方、local／cached 和两分钟 quote，不给出虚构价格 |
| `preview_voice` | source、revision、voice、mode、quote，可选 target | 主机 spend 授权后生成；返回音频资源 URI、实际字节摘要与时长，不报告已经播放 |

序号只随真实 job 状态或进度变化增加。intent 上限 1024、近期 job 上限 20；状态和幂等仅存在当前进程，没有跨重启恢复。相同 intent 不得改变来源或范围，旧版本任务仍可观察和取消；任务不会切换到新文稿继续合成。`lecture_synthesize` 同步插件工具已停止暴露，`presmium-lecture export` CLI 未改动。

quote 固定其实际 execution 实例，最多保留 64 项。试听资源最多 8 份、总计 16 MiB、单份 8 MiB，通过 `presmium://voice-preview/{id}?document=...` 返回真实 MIME/blob。Web 保留既有 quote／confirmed POST 与 `VoicePreviewAnswer` wire 格式。关闭会取消并等待尚未完成的目录、admission、生成和试听。

真实本地 TTS、取消、remount、资源字节与关闭的范围见[共享任务记录](benchmarks/voiceover-task-owner-2026-10-27.md)。其中原 speech cache 的同 engine ID／不同 profile 身份问题独立记录，不因任务 owner 或 quote 固定便宣称已解决。
