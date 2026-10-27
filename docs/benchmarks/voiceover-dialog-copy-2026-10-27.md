# 配音生成弹窗的文字与状态

2026-10-27，基于 `029bdf32`，在隔离 worktree `voice-task-owner` 精简 `VoiceoverDialog` 与中英文 `VOICE_MESSAGES`。公共控件沿用正式 [Dialog 25:565](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=25-565) 和 [I05 40:4650](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=40-4650)，没有新增控件、样式或素材。

弹窗保留范围、音色、讲稿、真实任务进度与错误、旧版本标识和提供方披露。移除常驻实现说明及重复完成提示；摘要只显示待生成和不可用数量，零项省略。真实任务要匹配当前 source、IR 并覆盖所选范围，且为活跃任务或实际完成的 done，才替代简短就绪反馈。其他步骤、旧版本及失败或取消的历史任务不能遮掉当前范围的真实就绪状态。

关闭按钮与可访问名称在本弹窗自己的请求处理中、任务状态未知或仍活跃时显示“取消并关闭”；只有外部任务时仍显示“关闭”。原 `cancelOwned`、客户端 intent、共享观察器与录音守卫不变。

独立源码审查 APPROVE。首轮 62 项对应 Dialog SHA `a54cdf9e6c05a13c47f7cdc72d6ec77e89685bef0cc77b28e95d1ecab0e07f01`、messages SHA `9cca13c16fa21057aba7ffe82591e01b9bdfa5c602c6f297dcb3853ce5a166c6`；原 manifest 保留为 `.presmium/ui-evidence/voice-dialog-copy-source-manifest-before-short-service.json`。`voice-dialog-copy-types-final.log` 记录 1223 文件类型检查通过，分层与 diff 检查通过。实际 Node 导入中英文消息函数，读取待生成、不可用、两者并存及单数结果，零项省略、英文单复数正确。

独立真实 UI 消费者通过 62/62 项，冻结结果是 `.presmium/voice-dialog-copy-1793098665245/core62-frozen.json`，SHA-256 `3cef5f41dad8dd59b046dac92e88c8c7ebc4b292112fc00079b4250eddf16e11`。24 种状态组合覆盖 en/zh-CN、亮/暗色、1440/390 宽度与 ready/unavailable/missing。实际 Settings 切换主题，390 使用粗指针上下文；所有对话框没有常驻 description 或横向溢出。ready 只显示短就绪提示，unavailable 的能力原因只出现一次，missing 保留真实提供方披露。四种主题/窗口组合的截图已实际查看。

请求处理中点击“取消并关闭”的旅程，使用真实客户端生成 intent，并在生成 POST 转发到后端前暂缓传输；关闭后真实任务 owner 查询返回 cancelled，没有 job，没有转发生成。范围反例则由 MCP 为另一步启动真实缓存命中任务并完成；当前步骤仍显示就绪，未被另一步的 done 记录遮掉。failed/cancelled 历史不遮就绪的分支已经静态审查，本轮没有把它计作实际浏览器旅程。

首轮提供方只有 8 次实际本地 Kokoro 目录 GET，均为 200；provider POST、TTS、ASR 均为 0。浏览器异常与 HTTP 错误均为 0，两份运行源码在该轮前后 SHA 一致，所有私有 canonical 输入保持不变。

看图后，再将公共 `noService` 中英文分别缩为“未连接语音服务。”和“No speech service connected.”，其他字段与逻辑未变。messages 最终 SHA 为 `8fa27b4c110efee9f6a10e4ade029d2885d1eccc17f6f54802b5c908664deefd`，Dialog SHA 保持不变。只逆替换这两个字符串，源码 SHA 精确恢复为首轮的 `9cca13c1…`；旧 SHA 与来源链分别保存在 `voice-dialog-no-service-before.json` 和最新 `voice-dialog-copy-source-manifest.json`。`voice-dialog-no-service-types.log` 记录新版本 1223 文件类型检查通过。

这两句文案另做独立补验：`.presmium/voice-dialog-noservice-1793099103941/unavailable8-frozen.json` 通过 20/20 项，覆盖 unavailable 的 en/zh-CN、亮/暗色、1440/390 宽度共 8 种状态，SHA-256 为 `c4a583d66721648650b2da4d4bc4c44a8e64c0aff4bee337fef9dd9ab157884f`。短句、去重和无溢出均通过，8 张截图已查看；目录及所有提供方请求、TTS、ASR、浏览器异常、HTTP 错误均为 0。新两源在补验前后 SHA 一致，原 62 项冻结 raw 的 `3cef5f41…` SHA 未变；没有把旧 62 项计作新 messages 版本重跑。

两轮的 `cleanup-final.json` 均记录消费者实际退出码为 0，私有浏览器、客户端、服务、进程、端口和临时目录已清理。补验前消费者曾因 manifest 输入路径错误而退出，保留 `bootstrap-error.json`，该次没有启动服务。两份冻结 raw 保持原 SHA；本任务的两个 CPU 提供方容器已停止并移除，镜像与模型缓存保留。实施和私有验收阶段没有操作公共部署、修改后端或新建 tracked tests，也没有运行测试套件。

随后将已提交的 `257280ad` 部署至公开 4320，记录为 `.presmium/ui-evidence/live-shared-voice-deployment-257280ad.json`。最小只读浏览器旅程显示首页 11 份文稿、guide-authoring 七页及一个原生编辑器，未进入制作区、建立预览 iframe 或请求 IR；写入、生成、外网、浏览器及 HTTP 错误均为 0，11 份权威 JSON 字节不变。重启前后的两种主机名登录状态均保留，新入口正常，临时浏览器状态已删除。

`live-copy-257280ad-smoke.json` 保留一次错误的版本核验 oracle：它要求整个脚本响应 SHA 等于单份 client.js，但 DSH 按[公开 combo 协议](../../vendor/docs/dsh/packages/client/modules/README.md#incremental-composition)组合多个 entry。后续只读 GET 的 `live-copy-257280ad-script-proof.json` 实核：2,914,026 字节的完整提交产物在 10,226,800 字节响应中连续、唯一出现，偏移 7,202,458，截取 SHA 为 `4b96a9ba174f72d98715589f2b191e25b10f171cb0d7fa4b8d9d6d68256470e9`。没有裁剪或改写 entry 字节，没有用文案字符串命中代替完整产物核验。原失败 raw 不改写为通过；其余只读观测与独立精确 entry 证明分别保留，浏览器及 GET 进程均已退出。
