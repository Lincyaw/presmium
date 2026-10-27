# 正文图片拖入与粘贴

2026-10-27。Chromium、真实私有 Studio、独立工作区与实际图片导入接口；没有运行测试套件，也没有修改公共工作区文稿。

## 原因与实现

原生 BlockNote 文件处理在遍历 `DataTransfer.items` 时逐项等待上传。浏览器在本次拖放任务结束后清空这份列表：真实同时拖入 A、B 两图只导入 A；第一张无效时，异常还会中断后续文件。拖入当前 schema 不支持的 PDF 则产生未处理的浏览器异常。

现在通过公开 [Tiptap FileHandler](https://tiptap.dev/docs/editor/extensions/functionality/filehandler) 同步取得 `File[]`，通过 BlockNote 公开扩展禁用原 `dropFile`。在目标位置按文件顺序插入原生空图片块，逐项调用已有真实导入接口；失败项保留图片选择入口，后面的有效文件继续导入。纯文件剪贴板通过公开 `pasteHandler` 进入同一条导入路径；带 HTML 的剪贴板仍交由编辑器原有处理。

队列按编辑器身份保存，各次导入使用实际调用方和取消信号。每项结果仅更新原稳定 ID 且仍为空的图片；删除、替换、切文稿或重新挂载编辑器后，旧回调不能再绑定内容。扩展每次 mount 使用独立 `AbortSignal`，不能在重新启用编辑时复活上一次 mount 的任务。

视觉检查还发现 [DSH 的全页附件监听](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.2.1-alpha.4/packages/client/ui-attachment/src/client/drop-events.ts) 与编辑器拖放冲突：外层收到 `dragenter` 显示提示，但 FileHandler 消费 `drop` 后外层无法清除提示。正文在普通冒泡阶段隔离文件 `dragenter`、`dragover`，保留 ProseMirror 的目标处理与原生 `dragleave`，不修改依赖、不合成清除事件，也不通过 CSS 隐藏遮罩。

失败反馈组合既有 `PmNotice` 与 `PmIconButton`，仅在失败后显示文件名和短原因，可以关闭。业务 CSS 只安排布局。原生上传／嵌入面板继续使用已登记的 NativeFilePanel，不增加常驻说明或另一套上传器。

## 实际记录

本地原始数据保存在忽略目录 `.presmium/ui-evidence/`，文件内登记所测源码 SHA；消费者、浏览器、私有 Studio 与临时目录均已清理。

| 记录 | 实际范围 |
|---|---|
| `native-image-drop-before.json` | 真实、`isTrusted=true` 的双图、坏图后跟好图、不支持文件三个失败复现；保留失败断言与异常。 |
| `native-image-drop-data-store.json` | 真实拖放事件中，原列表在任务结束后为空，事先捕获的两个 `File` 仍可读取。 |
| `native-image-drop-after.json` | 最终导入实现的三条实际拖放路径：双图均保存并解码、顺序不变；坏图不阻断后续图片且保留重试；不支持文件不写入无效块；三条路径之后正文均可继续输入并实际保存。仅坏 PNG 返回预期 422。 |
| `native-image-late.json` | 18/18。后端实际采用后，通过 CDP 暂停响应：真实 Ctrl+Z 删除空图片后不重建；同 ID 替换既有 URL 后不覆盖；双图首张暂停期间真实切文稿，后续旧文件不发起，新文稿自身仍可导入。替换 URL 与同一编辑器 readOnly／重新 mount 是公开 API 辅助，未冒充鼠标替换控件。此记录早于随后两个拖放冒泡处理器及并行富文本样式配置；不将它描述为重跑后的全部链路。 |
| `native-image-input-visual-review-before.json` | DOM 尺寸检查通过，人工查看四张截图却发现 DSH 提示遮挡，判为未通过；保留原图 `native-image-input-appearance-*-overlay-before.png`。 |
| `native-image-input-appearance.json` | 14/14。实际浅／深色 × 1440 桌面／390 粗指针：长文件名换行、不横向溢出、30／44 控件；关闭不改文稿；先从应用栏进入再拖入正文也能移除 AI 提示。四张最终截图均已实际查看。系统剪贴板真实 PNG 粘贴一次，实际保存并解码，无浏览器／HTTP／生成错误。 |

初次四视图消费者使用重复的 `data-id` 定位，尚未操作便触发 strict locator 错误；原记录保留为 `native-image-input-appearance-oracle-before.json`。随后 PNG 剪贴板夹具未通过浏览器解码，保留为 `native-image-input-appearance-clipboard-fixture-before.json`，改为浏览器生成有效 PNG 后才运行成功。晚回调消费者初次以 `route.fetch` 重放原生 multipart，得到空文件 413；保留为独立初始记录，改用 CDP 响应阶段暂停原始请求，没有把它当成产品失败或通过结果。

轻量检查：类型、令牌、分层与 `git diff --check`。未运行单元测试、集成测试套件、完整 E2E 或示例全量构建。本次不宣称快速键盘选区同步、富文本剪贴板保真或完整编辑体验已全部验收。
