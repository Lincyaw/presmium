---
"@lincyaw/kernel": patch
"@lincyaw/compiler": patch
"@lincyaw/workspace": patch
"@lincyaw/server": patch
"@lincyaw/mcp": patch
"@lincyaw/web": patch
"@lincyaw/addon-motion": patch
"@lincyaw/dsh": patch
"@lincyaw/skills": patch
"@lincyaw/presmium": patch
---

文稿树、引用与同步块可以真正使用了：工作区服务提供文稿树与回收站，可以新建、移动、改名、复制文稿，放入回收站、还原与彻底删除（下级文稿随之一起），每次操作在涉及的每份文稿的历史中各记一条、可以撤消；还能查看谁引用了一份文稿、按标题和正文搜索文稿、预览引用目标。正文中的引用在网站上链接到目标页面，在幻灯片、notebook、讲授视频与单文稿导出中显示为文字，目标改名后引用处记下的标题自动更新；同步块按源文稿当前的内容显示，步骤与状态由所在文稿决定，源被放入回收站时仍然显示，彻底删除前自动转为副本，也可以随时转为副本。发布的网站按文稿树嵌套显示侧栏。AI 通过新增的 MCP 工具（`get_tree`、`search_documents`、`get_backlinks`、`create_document`、`move_document`、`trash_document` 等）完成同样的操作。
