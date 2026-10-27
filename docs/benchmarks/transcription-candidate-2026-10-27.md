# 音频转写候选服务首片

2026-10-27。新增服务以 canonical 音频资产为输入，提供真实 SPEECH 的候选任务、读取与取消接口；不采用文字、不修改讲稿、不生成配音。本次只验证无引擎和拒绝边界，没有调用真实或 fake 模型。

## 实现范围

公共入口是 `@lincyaw/workspace.createDocumentTranscriptions`，共享类型在 `packages/kernel/src/contracts/transcription.ts`。HTTP 薄适配复用相同方法：

| 接口 | 行为 |
| --- | --- |
| `GET document/transcription/capabilities` | 读取当前实际 STT 引擎；无能力返回 unavailable，明确首次仅支持 whole-asset |
| `POST document/transcription` | 固定 intent、CanonicalSource、AssetID、真实 SHA 和明确引擎，校验完整音频后接纳任务 |
| `GET document/transcription?id=…` 或 `intent=…` | 读取任务与 sequence，重新判定 source／音频是否仍 current |
| `GET document/transcription/result?id=…&revision=…` | 只读取对应不可变候选，核对内容摘要；不接受任意文件路径 |
| `POST document/transcription/cancel` | 取消已知任务，或持久保存尚未接纳意图的取消记录 |

任务目录是文稿内 `transcriptions/<任务ID>/`；`task.json` 保存意图和任务状态，成功识别后 `<revision>.json` 保存候选。任务 ID 绑定文稿目录、canonical 身份、成员与意图。新任务文件独占创建，后续状态以原子替换持久保存。进程中断的非终态记录不自动重新调用提供方，读取报告 `transcription-interrupted`；该状态恢复分支尚未做真实运行中断验证。

SPEECH 和真实媒体探测器由目标服务上下文注入，workspace 不引用插件源码。音频沿现有真实字节探测，且服务再次检查十分钟上限。正式任务固定整份音频字节，不把 clip 的播放裁切范围冒充已裁切的 ASR 上传。能力查询、拒绝、任务读取和取消均不自动调用转写。服务关闭会中止本实例工作并等待收束。

## 真实验证

消费者使用实际 `serveWorkspace`、两个独立临时文稿、私有 git、真实 Ogg 字节、真实 16 MiB 边界文件和文件系统符号链接。使用只有临时服务令牌与隔离 cache 的显式环境，不传运营者语音配置。进程还拒绝所有非 loopback fetch；没有访问公共 Studio、用户文稿或凭据，没有新增 tracked tests 或运行套件。

| 记录 | 结果 | 主要断言 |
| --- | --- | --- |
| `.presmium/ui-evidence/transcription-candidate-boundaries.json` | 31/31 | canonical 源／摘要、实际无 STT 引擎、未确认、缺资产、非音频、远程、符号链接、实际格式、超限文件、错误摘要、未支持的裁切、权限与 HTTP 方法、预取消及服务重启、shared service 角色与 dispose |
| `.presmium/ui-evidence/transcription-cancel-source-boundaries.json` | 8/8 | 实际保存预取消记录后破坏 JSON，已知 ID 仍可取消／读取；替换 canonical UUID 仍可取消；未知意图在坏源时要求 ID；重启后迟到请求仍被拒绝 |

第一份首轮 31/31 另存为 `transcription-candidate-boundaries-initial.json`。其后源码收紧坏源下的读取／取消门槛，最终主记录重新验证相同 31 项。没有把取消记录包装成已开始的 ASR 任务；坏源链没有伪造 running job 或提供方响应。

主链中，真实 Ogg 探测完成但引擎目录为空，开始请求返回 `503 transcription-engine-unavailable`，不创建任务或候选。实际损坏媒体返回 `422 production.asset-format`，过大文件返回 413，陈旧来源返回 409。其他主动拒绝均保留在原始请求记录中，不能把整轮说成 HTTP 全零。

两份最终记录都 `complete=true`，未发生非本地请求，服务、临时目录及 fetch 观察器均已清理。主链讲稿含 pronunciation 与 cue，前后 `lecture.json`、原音字节、另一文稿和 git HEAD 完全一致。坏源链只为验证读取门槛在私有副本暂时改坏／替换 JSON，结束恢复原字节，未发 canonical 保存请求。

源／脚本／证据的最终 SHA 记录在 `.presmium/ui-evidence/transcription-candidate-final-manifest.json`。`routes.ts`、kernel 导出汇总另有并行 canonical authoring hunk，记录 whole-file SHA 作为实际运行来源；本提交只拥有 transcription 对应的局部 hunk。

## 未验证与后续门槛

本次没有可用语音引擎，未证明成功识别、提供方运行中取消、真实词时码、成功候选落盘与读取、运行中服务崩溃恢复或跨进程接纳。不能宣称“人声已转成讲稿”或“当前 TTS 已更新”。这些分支需要后续明确授权、真实引擎和输入范围；不以 stub／fake provider 补成成功案例。

尚无 Video 录音／转写控件、MCP 转写工具、讲稿差异预览与采用接口；canonical `Narration`、音色与媒体 clip 全部不由本服务修改。后续切片及 typed pronunciation／cue 保留规则见 [RFC](../rfc-recording-transcription.md)。
