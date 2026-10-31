---
"@lincyaw/kernel": patch
"@lincyaw/host": patch
"@lincyaw/workbench": patch
"@lincyaw/dsh": patch
"@lincyaw/mcp": patch
"@lincyaw/cli": patch
"@lincyaw/studio": patch
"create-presmium": patch
"@lincyaw/viewer": patch
"@lincyaw/addon-code": patch
"@lincyaw/addon-lecture": patch
"@lincyaw/addon-exec": patch
"@lincyaw/addon-exec-jupyter": patch
"@lincyaw/addon-assistant": patch
"@lincyaw/addon-classroom": patch
"@lincyaw/addon-exec-local": patch
"@lincyaw/addon-exec-wasi": patch
"@lincyaw/addon-exec-webgpu": patch
"@lincyaw/addon-guide": patch
"@lincyaw/addon-publish": patch
"@lincyaw/addon-session": patch
"@lincyaw/addon-speech": patch
---

界面文本按术语规范收尾：失败原因（保存、预览、发送给 AI、复刻音色、Jupyter、讲授工具与配音、代码引用参数、提示命令）按代码显示为 zh-CN 与 en 的目录文本，不再显示服务端或浏览器的英文原文；文稿修改的待确认说明改为按页面的简短摘要，不再显示 JSON 与标识；启动报告按插件声明的双语名称显示（`PluginManifest.name`）；视频制作的提示显示本地化的动作名；撤消与恢复的快捷键每个平台只写一种（Apple 设备 ⌘Z、⌘⇧Z，其他 Ctrl+Z、Ctrl+Y）；Jupyter 与 MCP 的凭据叫“访问令牌 / access token”；命令行的系统语言判断移入 `@lincyaw/kernel/node` 的 `systemLocale`。`AgentTool.errors` 让插件工具为它抛出的错误码提供按文稿语言的说明。
