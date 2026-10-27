# Doc 字幕栏的编辑范围

2026-10-27，独立 worktree `document-caption-scope`，基于 `620889f9`。只移除 Doc 字幕栏的 `DocumentVoiceField` import 和 footer；字幕编辑器、步骤导航、配音开始控件及 Video 组件均未改动。设计规范同步这一边界。

实施前实际读取 [正式 Filled 画板](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=117-4164) 的高清 context 与截图。复用已有原生 `NarrationEditor`、`PmSegmented`、`PmIconButton` 和公共 Lucide 图标，没有新增控件、CSS、令牌或素材。

## 真实私有验证

通过原版 `startStudio({isolateClient:true})` 启动一个轻量、两步的私有文稿，使用真实 Chromium 和 Workspace 服务。四种组合分别为 1440／390 CSS px、亮色／暗色；实际主题状态也逐一核对。Doc 与 Video 各 4 张截图已逐张查看。

| 实际动作 | 结果 |
|---|---|
| 四组合打开 Doc 字幕栏 | 只显示原生字幕、步骤导航与配音开始；无音色、生成、发音或高级时长字段。原生正文编辑器保持挂载，仍在文档模式 |
| 桌面亮色原生编辑正文、字幕和配音开始 | 后端实际读回新正文、`narration-a` 新文本及 `after-animation`；另一段讲稿与原音色设置不变 |
| 四组合切下一步再返回 | 显示各自稳定步骤的字幕，保存后的修改仍在 |
| 四组合打开 Video | 同一 `narration-a` 文本可见；音色、选择音色、生成配音、最短停留与结束停顿保留 |
| 四组合打开并关闭现有音色 Dialog | 真实入口可用，不修改音色或发起生成 |

正式结果为 **18/18**。文稿使用明确静音来源，没有配置语音引擎；该记录不代表真实 TTS 或音色目录已经验证。Video 的轻量预览编译沿既有行为运行，本轮没有启动导出任务、完整示例构建或模型。截图中的预览准备状态不作为播放验收。

原始记录为 ignored `.presmium/document-caption-scope-1793116219901/result.json`，SHA-256 `10474b3f8b52856ee365c6ddc984696a196120973af4cdd09d7ab047fc8de71b`。最终 Panel SHA-256 为 `aa75f41bd2938d2484c67dbb3c8dafb8575096060184fe35c2c16f71d42ba7de`；11 个观测文件在运行起止及交付时均匹配。

两次早期消费者停止记录保留：`1793115920066` 在步骤容器挂载后立即读取尚未就绪的原生编辑器文本，已完成 2 项；`1793116080630` 在 Video 同样过早读值，已完成 3 项。失败截图随后均显示了预期文本。只修正 ignored 消费者等待实际字段文本的条件，产品源码始终相同；这两轮不计入最终通过数，也不冒称产品回归。

三轮均无 pageerror、HTTP 错误、外部请求或模型请求。浏览器、私有 Studio home、工作区和 fixture 全清，各 owner／backend／frontend PID 均已核实退出。完整文件、截图、脚本与原始记录 SHA 见 `.presmium/ui-evidence/document-caption-scope-final-manifest.json`。

轻量检查通过：类型 1240 文件、分层与 `git diff --check`。没有新增 tracked tests，没有运行测试套件；本轮仅中文界面，未重验录音、转写、配音生成、导出或其它工作台功能。
