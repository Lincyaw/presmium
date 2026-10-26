# 原生批注的编辑与重载链

2026-10-27，从 `16ded6c8` 启动随机实际端口的独立 Studio，使用新建的两页、多段和原生表格私有文稿。所有创建、回复、处理状态与正文操作均通过真实浏览器 UI；没有调用 ThreadStore 写 API，也没有修改产品源。

`native-comment-stage-a.json` 完成 21 项检查，全部通过。主线为鼠标跨段选择 Alpha／Beta，点击 BlockNote 官方“添加评论”，输入并保存；随后在官方侧栏回复、解决、重新打开。每一步都等待真实保存，并读取私有 `lecture.json`：同一线程、两条评论的 ID 保持，锚点为 `alpha:6 → beta:11`。

正文前方插入和删除文字时，规范锚点偏移随原生 mark 移动；原生 Ctrl+Z／Ctrl+Shift+Z 恢复正文、范围和高亮，不撤回独立的回复与处理状态。整段流程没有进入放映。

另完成两个必要范围对照：

- 真实鼠标选择从第一页 Beta 跨过第二页标题到 Gamma，官方工具保存 `beta:15 → gamma:10`，重载后仍高亮相同文本与中间标题。
- 在原生表格第一单元格内框选 `cell A`，保存锚点为稳定单元格 `cell-a:6 → cell-a:12`。删除全部锚文后保留无锚线程，不把它接到其他文字；原生 Undo 恢复同一单元格 ID、偏移与高亮。

浏览器 reload 返回文稿列表，再显式打开同一私有文稿。三份线程的规范数据、ID、原生 threadPositions 和 mark 文本均与重载前相等，官方侧栏显示主评论、回复、跨页评论和单元格评论。最终 API 只读结果与磁盘 JSON 相等，schema 校验通过；文稿有 17 条实际 git 历史，过程中记录 16 次真实 `document/change` 请求。API 在这里用于辅助核对，主要证据来自 UI 动作及实际磁盘保存。

原始记录、脚本与截图位于忽略目录 `.presmium/`、`.presmium/ui-evidence/`。观察器只读公开选择、焦点、CommentsExtension 状态和原生 marks，并原样委托编辑器接入。`native-comment-stage-a-final.png` 已查看，正文三处高亮与官方线程显示对位。浏览器错误、HTTP 失败和生成请求均为零。finally 已关闭浏览器和自有 Studio、移除 fixture；随机端口随后连接被拒绝。残留的交互消费者输入进程在清理后停止。

消费者中途的失败全部保留在同一 actions 数组：最初误将 Ctrl+Shift+ArrowDown 当作扩选，实际触发 BlockNote 移块，随后原生 Undo 还原；曾误查 composer 类名、同时匹配只读与回复编辑器、未 hover 评论就查操作按钮，以及误以为 reload 会直接打开文稿。首次 fixture 缺少必需的 layout，被 schema 正确拒绝，保留为 `native-comment-stage-a-fixture-first-oracle.json`。

两次正文点选未到达预期活动端也保留原始快照，未据此归咎批注扩展或修改产品。后续诊断记录了真实命中节点、pointer／focus／selectionchange：从线程返回正文的点击最终得到正确原生 `head=11`；确定位置后的原生键盘输入与锚点映射通过。本轮没有证明最初两次点选差异的根因，不能把它们称为已修复问题。

本轮未发现需要产品修复的已确认缺陷。没有重复动画 iframe 框选调查，没有运行主题／宽度矩阵、套件或新增 tracked tests；任意表格合并、拆分、行列重排、重叠线程与系统输入法仍不在此记录范围内。
