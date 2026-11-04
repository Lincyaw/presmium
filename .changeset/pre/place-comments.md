---
"@lincyaw/kernel": patch
"@lincyaw/workbench": patch
"@lincyaw/design": patch
"@lincyaw/language-server": patch
"@lincyaw/mcp": patch
"@lincyaw/dsh": patch
---

批注锚点支持稳定的位置 `{ blockId, stepId }`（省略 `stepId` 表示整块）。工作台的动画、图表预览工具栏可对整个内容块或某一步新建批注，批注栏按文档顺序标注步骤；位置批注与文本批注共用同一套草稿备份、回复、解决与权限。块或步骤变化时，步骤失效的锚点降为块级，块失效才变为无锚点线程。MCP 的作者动作、语言服务器的页面归属与 JSON Schema 同步支持两种锚点。独立的批注编辑器（草稿预览与位置批注）改用设计令牌，暗色下不再显示成亮色输入框。
