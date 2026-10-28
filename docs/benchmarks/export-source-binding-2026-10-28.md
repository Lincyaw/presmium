# 讲授视频导出绑定精确源版本

2026-10-28，对提交 `1e4a79be`（导出器收到请求的 canonical source，重新编译后不一致就拒绝）做真实运行验证。Studio 从 main 源码启动，工作区是 `examples/animations/try.mjs` 新准备的私有副本，文稿为“冒泡排序”（32 秒，语音来自随讲义提交的合成缓存）。Chromium 为本机 Playwright 缓存中的版本，没有调用任何模型。

## 问题与改动

任务在启动时按请求的版本编译，但讲授视频导出器在运行时会重新编译磁盘上的文稿。排队期间保存了文稿，导出器渲染的就是新版本，任务却仍标为请求版本的产物。现在 `ExportContext.source` 传入请求版本，导出器编译后比对 `documentId`、`version` 和 `fingerprint`，不一致抛出 `job-source-changed`；没有 source 时抛出 `job-source-not-compiled`。工作台对应的中英文提示已存在。

## 实际运行

| 场景 | 操作 | 结果 |
| --- | --- | --- |
| 正常导出 | 视频制作 → 导出 → 讲授视频 | 约 70 秒完成，标为“同一已保存版本”；`lecture.webm` 1042800 字节，ffprobe 为 VP9 1280×720、Opus 音轨，时长 32.02 秒 |
| 同版本再次导出 | 当前版本已有完成的视频时再点讲授视频 | 复用已完成任务，没有新任务 |
| 运行中保存 | 任务开始约 1 秒后在磁盘上改正文 | 导出器已在保存前完成编译；任务按请求版本完成，标为“与当前编辑版本不同” |
| 排队中保存 | 任务 A（版本 Y）运行时改文稿为 Z，经工作台同源接口排入任务 B（版本 Z）；B 排队时再改为 W | B 等待 58 秒后开始，日志在“building the web form and the lectures…”后 52 ms 以 `job-source-changed` 失败；工作台显示“The saved document changed. Start the export again.”。A 按 Y 完成 |

Web 界面在讲授视频任务运行期间禁用同一目标的按钮，因此“排队中保存”用工作台同一来源的 `POST /api/presmium/jobs` 请求排入第二个视频任务；只用界面时，也可以先排入其他目标的任务再排视频，但幻灯片导出很快，难以稳定命中窗口。

## 未覆盖项

只验证了讲授视频导出器；其他导出器（幻灯片 PDF／图片／PowerPoint 等）不使用 `ExportContext.source`，排队中保存时是否同样会渲染新版本没有核查。中文界面的提示文字只核对了源码，没有在中文界面中截图。私有 Chromium 路径找不到的问题本机没有出现，未复现。未运行测试套件或示例完整构建。
