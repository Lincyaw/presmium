# JSON 文稿的原生编辑器验证（2026-10-26）

本记录覆盖工作台的 `DocumentEditor` 和 `BlockNoteSurface`，使用真实 Chromium 独立消费者运行。权威文稿是 `@lincyaw/kernel` 的 `TeachingDocument`；运行快照、工作区 HTTP 保存、CAS 与 Studio 整体流程另行验证。未运行测试套件，也未修改用户的 `4320` 工作区。

原始证据位于 `.presmium/ui-evidence/json-editor-native.json`，截图为同目录的 `json-editor-{light,dark}-{1280,390}.png` 与 `json-editor-coarse.png`。消费者没有预览 iframe，每篇文稿只有一个正文 BlockNote 编辑器。

## 已实际完成

- 原生修改第二页正文后，第一页的段落、六级标题、列表及列表项、表格行与单元格保留稳定 ID；粗体、文字颜色、公式、链接、换行、表格对齐与列宽保留。分栏树、代码实例的标题和步骤高亮、未知组件的参数、定义版本与任意数据、讲授编排均保留。
- 真实鼠标从第一页段落拖到第二页正文，范围经过列表、表格、分栏、代码与未知组件。点击官方 `AddCommentButton`，在官方表单输入文字并提交。正文保留原生 comment marks；文稿保存线程、Presmium 富文本批注正文和两个稳定节点 ID 加偏移。
- 将这份文稿 JSON 重新挂载后，原生 `threadPositions` 恢复为同一范围。原生 Enter 与 Undo 正常，页面与线程保持。批注不使用 Yjs、服务端协作或第二份编辑器文档。
- 通过公开 `TableHandlesExtension` 在原表格上方插行，新增行与单元格得到新 ID，原行和原格保持 ID。重新挂载 JSON 后再次编辑正文，原格 ID 仍保持。编辑器通过公开 Tiptap 属性扩展携带行和单元格身份，保存仍使用 Presmium 富文本 AST。
- 浅色与 `.dark` 下分别查看 `1280` 和 `390` 宽度的完整编辑器。真实 `pointer: coarse` 环境中，批注、添加块、块菜单和提交按钮均为 `44×44`；正文与批注输入的计算字号均为 `16px`。

批注恢复使用公开 `CommentsExtension.tiptapExtensions` 的 mark 名称和 `editor.transact` 重建原生标记。初次无协作实验曾因键盘没有产生非空选区而误判失败；用真实鼠标范围重测后，无协作情况下的原生线程创建和刷新恢复均成功，证据为 `native-comments-native-restore-public-api.json`。

## 尚未由本记录覆盖

系统输入法组字、平台组合键差异、表格合并拆分与任意重排的身份、整套 Studio 的文件保存与断线恢复不在本次消费者范围内。

## 真实工作台的后续验证

`.presmium/ui-evidence/json-app-native.json` 在隔离 Studio 中完成了新建文稿、正文自动保存与原生撤消、新增页面、重命名、上下移动、明确删除、跨页原生批注、官方线程侧栏，以及刷新后重新打开的批注恢复。一次正文输入至真实 JSON 保存确认为 `575 ms`。正文输入后立即返回文稿列表并重新打开，最后一次输入仍在，随后真实保存。浏览器异常为零；未以独立消费者结果代替工作区保存结果。

工作台四组截图为 `json-app-{light,dark}-{1440,390}.png`。窄屏截图仍打开导航覆盖层，正文视口关闭导航后的检查另行记录。

`json-editor-code-native.json` 确认代码字符串的官方原生批注、保存后的稳定代码块 ID 与字符偏移，以及刷新恢复。`json-editor-cell-native.json` 确认表格批注使用稳定单元格 ID 加格内偏移；在前方插入一行并重新挂载后，原生线程仍指向原格，未按行列位置重新绑定。
