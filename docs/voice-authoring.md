# 音色能力与目录读取

`DocumentVoiceAuthoring` 是 Web 与 MCP 共用的只读作者服务，契约在 `packages/kernel/src/contracts/document-voice.ts`。它从当前 `lecture.json` 装配实际 Node 服务，不等待正文、动画或编译 pass。读取目录不选择配音来源，不合成音频，也不改变讲稿。

| 入口 | 输入 | 实际回执 |
| --- | --- | --- |
| MCP `get_voice_authoring_capabilities` | 文稿目录 | source、configuration-only、配置状态、实际引擎声明和默认引擎、已安装的 voiceover／preview 实现 |
| MCP `get_voice_catalog` | 可选 `query:{source?,engine?,lang?}` | 当前 source、实际引擎声明与 provider／bundled 目录或明确 unavailable |
| HTTP `GET voice-capabilities` | 既有文稿选择协议 | 同一能力回执 |
| HTTP `GET voice-catalog` | 可选 engine／lang | 同一目录服务的当前结果 |

入口要求编辑者权限。MCP 绑定文稿的 token 不能读取别的目标。expected source 可省略；提供时核对 UUID、version 与 fingerprint。读取前后都核对同一 canonical source，发现变更返回 `document-version-changed` 和 currentSource，不把旧目录答复归给新源。

`status=configured` 只表示实际引擎声明能合成，不证明服务认证、音色存在或生成成功。`voiceover/preview` 只来自实际插件服务标记，不是任务队列，也不证明当前讲稿已经有配音。没有服务或引擎时返回 unavailable；speech 缺失且装配有错误时保留 findings 并报告 unknown。独立编译 stdio 宿主没有工作区作者服务。

目录的 available、unsupported 与 unknown 不互换。缺少 provider rate／style 范围时不生成选项；不根据音色名字猜测能力。提供方失败保留真实错误，不退回虚构的空可用列表。配置和目录读取都不启动 ASR／TTS。

共享目录请求按实际读者计数。取消一个读者只结束自己的等待；最后一个读者离开时中止真实网络请求。成功结果保留缓存，失败或取消只移除原请求自己的条目，不影响后来新建的请求。工作区关闭取消自己持有的读取并等待实际结束；被取消的 consent 不能把目录记录为未知。原有网络上限保持 30 秒，不用延时等待代替取消。

音色继承、批量应用、试听报价与配音任务仍沿现有作者／讲授流程；本切片只共享能力和目录，不宣称这些 MCP 动作已经齐全。剩余边界见 [作者动作 RFC](rfc-mcp-authoring-actions.md)。

真实检查与取消验证见[音色作者记录](benchmarks/voice-catalog-authoring-2026-10-27.md)。
