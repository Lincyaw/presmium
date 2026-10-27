# 转写候选的预检与讲稿采用

2026-10-27。第二片把候选材料变成可检查、可拒绝、可原子保存的 typed Narration 修改，不调用 ASR 或 TTS。候选输入是明确标识的协议材料，不是语音识别成功证据。

## 实现与边界

`prepareTranscriptionAdoption` 是 kernel 纯 TS 规则：稳定 StepID、NarrationID 与候选 segment ID 决定目标；pronunciation／cue 必须保留、明确定位或明确删除。文字变化后遗漏原子、重复原子、未知原子、无效目标和不完整共享影响均返回冲突，没有可提交 plan。

共享 `createTranscriptionAdoption` 复用现有 `DocumentEditor.plan`，直接使用其 `planId`。实际写入仍使用原 `DocumentEditor.change/apply`、SourceEditor CAS、锁、git 历史、失败回滚与保存后读回；没有新的写入器或内容栈。apply 只接受 planId、source、candidate ID／revision 与草稿修订，不接受 origin 或任意 replacement。

默认共享 service.apply 使用 agent 路径，保留 review-required 门禁；HTTP editor 路径是工厂私有 closure，不能由 payload 选择。相同未保存意图可以递增草稿修订重新预检，旧 quote 立即失效；一次成功写入后的新修改需要新 change ID。发送修订随回执返回，前端仍负责保留晚 ACK 之后的新输入。

同 UUID、同原音的旧 ASR 候选可以基于当前 source 重新预检。新 UUID、原音 SHA 或实际时长不符会拒绝。`Narration.provenance` 仅保存采用出处，字幕与 TTS 继续读取 content；规范校验要求 provenance 仍引用同文稿音频。

共享 Narration 的 `edit-shared` 必须确认全部引用步骤；`fork` 为选中引用生成新 Narration 与 cue ID，保留原共享实体和目标 payload。新 ID 依赖稳定目标而非预检列表序号。fork 复制已有 cue／narration override 绑定以保留有效时机；这些新增绑定显示在完整预检候选和 fork 映射中。删除仍有暂停配置的 cue 须明确确认对应清理，不影响其他 hold、pause、voiceSource 或 media clip。

## 私有真实消费者

消费者 `.presmium/transcription-adoption-proof.mjs` 启动真实 `serveWorkspace`，使用独立临时 git 文稿与实际 Ogg 文件。它不替换服务、模型或 HTTP 后端。环境只传临时服务令牌、隔离 cache 与 PATH，拒绝非 loopback fetch。

`.presmium/transcription-adoption-material.mjs` 只在私有目录写候选协议材料，标明 `Protocol material, not an ASR provider` 与 `protocol-material-no-recognition-executed`。任务引用是读取候选所需的生产协议形状；消费者没有发转写 start 请求，不把该引用的 done 字段作为执行过 ASR 的证明。音频 SHA、真实时长、canonical 来源与后续采用事务仍由实际产品服务验证。

最终原始记录 `.presmium/ui-evidence/transcription-adoption.json`：`complete=true`，30/30，通过范围如下。

| 范围 | 实际证据 |
| --- | --- |
| 原子预检 | 未解决的 pronunciation／cue 与共享范围阻止 plan；重复／未知原子、缺失段落与错误 StepID 所属页均拒绝 |
| typed 保留 | 普通采用逐项保留原 pronunciation 的 display／spoken，以及 cue ID、action、target、parameters；字面 Markdown／cue 文本保持 text |
| 共享与分离 | edit-shared 确认两步引用；fork 只换所选引用，原实体不变；两步预检次序反转仍保持相同新实体 ID |
| 明确删除 | 只删读音仍保 cue；删 cue 未确认暂停清理时不能提交，确认后作为同一事务完成 |
| 版本与草稿 | 错草稿修订、origin 注入、更高修订后的旧 plan、预检后实际重排页面步骤、实际原音被替换均无法覆盖当前内容 |
| 保存与幂等 | HTTP commit.origin 为 editor；相同请求重用真实提交；空讲稿步骤只生成一个稳定 Narration；保存回执有候选与草稿修订 |
| 历史与重载 | 实际 workspace 版本 Undo／Redo 恢复同一 typed 内容、出处及 fork 身份；重启实际服务后仍从 canonical 读到结果 |
| 失败恢复 | 真实 `.git/index.lock` 导致 HTTP 500，JSON、index 字节与 HEAD 恢复；去锁后同一 review 重试成功 |
| 不受影响内容 | 原音字节、素材声明、未选页、正文、voiceSource 和 media clip 保持；fork 只复制有关时机绑定，明确删 cue 只清有关暂停 |

这里的 Undo／Redo 是 workspace 的 git 版本操作，不是 BlockNote 字词 Undo。首轮 29 项记录保留为 `transcription-adoption-initial.json`；其中历史动作标签曾使用含糊的 native-document-history，实际调用始终为 `history/undo` 与 `history/redo`，最终脚本与说明已明确。随后收紧 fork ID 按稳定目标生成，最终重新运行 30 项并在开始时记录源码 SHA。

独立定向记录 `.presmium/ui-evidence/transcription-adoption-old-candidate.json` 通过 5/5：先实际保存正文与步骤时机，确认当前 version 与候选原 source 不同，再使用旧候选重新预检／采用；保存后保留新正文、时机与原音。另在私有副本实际替换文稿 UUID，采用被拒绝。它补足“旧计划应拒绝”与“旧材料可重新对照”两种不同语义，不重新调用 ASR。

两份最终记录在开始时各捕获八份采用相关源码与一份外部接线 `serve.ts` 的 SHA；八份采用相关源码在交付时仍一致。`serve.ts` 属于并行 MCP 接线范围，后续 whole-file 变化单独记在 manifest，不把旧 run 冒称为新接线的完整验证。服务、临时目录与 fetch 观察器均已清理；原始记录保留主动拒绝和实际提交失败，不能宣称 HTTP 全零。完整范围／脚本／文档 SHA 见 `.presmium/ui-evidence/transcription-adoption-final-manifest.json`。

## 未验证范围

没有模型调用、付费调用、麦克风权限或真实 ASR 成功产物；没有验证真实提供方的取消或实际 TTS 播放。此消费者只证明候选协议材料到采用事务的正确性。MCP agent origin／review-required 的实际工具链由其独立消费者记录，不能拿本 HTTP editor 结果替代。

本片没有修改 Workbench、dsh 或原生编辑器，没有新增 tracked tests 或运行套件。完整用户流程和后续真实引擎门槛见 [RFC](../rfc-recording-transcription.md)。
