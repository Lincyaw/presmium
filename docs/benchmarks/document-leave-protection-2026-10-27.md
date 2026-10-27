# 未保存文稿的原生离开保护

工作台存在尚未确认的文稿输入时，关闭标签页会触发浏览器原生离开确认。取消离开保留当前标签页和输入；明确重试并确认保存，或明确丢弃草稿后，关闭不再提示。回到文稿列表或打开另一文稿，不会漏掉后台文稿的未保存输入。

这只是误关防护。作者在确认框中选择离开，仍会关闭标签页并失去该标签页的 `sessionStorage` 草稿；跨标签页持久恢复和浏览器崩溃恢复尚未实现。

## 实现范围

仅修改 `DocumentSession`。按全部 slot 的 `dirty`、`composing`、正文写入 flight 和图片导入 assetFlight 注册或移除 `beforeunload` 监听。有效恢复草稿在既有恢复流程中标记为 dirty；纯读取失败不作为未保存输入。

处理器只调用 `preventDefault()` 并设置空 `returnValue`，确认文字由浏览器决定。它不提交、刷新或重试文稿，也不在卸载时异步保存。状态回执、明确丢弃与后台保存沿统一通知更新保护；dispose 移除监听，晚回调不能重新注册。草稿存储范围、CAS 和自动保存等待时间保持。

## 真实证据

两次运行都使用独立私有 Studio、实际后端和随机实际端口。模板固定取 `936a7b58`，客户端记录当时源码与 bundle SHA；构建前后相关源码 SHA 一致。没有使用产品观察器或模拟后端。

| 证据 | 结果与范围 |
| --- | --- |
| [原行为](../../.presmium/ui-evidence/document-tab-close-recovery.json) | 7 项观察完成：真实离线 POST 失败后，标签页已有草稿；实际关闭没有确认，同一 browserContext 无 opener 新 tab 重开后输入消失，磁盘仍旧 |
| [候选](../../.presmium/ui-evidence/document-leave-protection.json) | 9/9 防护检查：dirty 关闭弹原生确认并取消、全文与草稿精确保留；明确重试实际 200 后 clean 关闭无提示；Home 与另一文稿覆盖后台 dirty slot；明确丢弃解除；纯读取错误无草稿时不提示 |

候选逐条记录三个 `beforeunload → dismiss` 和一个 `beforeunload → accept`，没有依赖 Playwright 默认处理。实际关闭使用 `page.close({ runBeforeUnload: true })`，重开使用同一 browserContext 的无 opener 新 tab；不是同 tab 重载。

接受离开的场景单独保留在 `remainingBoundary`：原生确认出现、作者选择 accept、标签页关闭，新 tab 无恢复草稿，未确认输入仍丢失，磁盘 SHA 不变。它没有计入“已解决恢复能力”。

候选没有浏览器异常或失败 HTTP；原始记录包含三次有意的离线保存失败、一次有意的文稿读取失败和十二次导航取消，共 16 条网络失败或取消事件。唯一收到的正文保存响应是明确重试的真实 200。

轻量类型检查通过，覆盖 1177 个文件；本次三条路径的 diff 检查通过。私有浏览器、服务、工作区及临时目录全部清理。未运行公共服务、模型、测试套件、全量示例构建或新的系统输入法／图片导入矩阵；未新增受版本控制的测试。
