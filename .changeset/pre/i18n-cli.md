---
"@lincyaw/cli": patch
"@lincyaw/studio": patch
"@lincyaw/mcp": patch
"create-presmium": patch
---

The command lines `presmium`, `presmium studio` (`presmium-studio`), `presmium-mcp` and `create-presmium` print their help, progress, summaries and errors in Chinese or English by the system language (`LC_ALL`, `LC_MESSAGES`, `LANG`), with the glossary's words; errors say what failed and what to do next. JSON, URLs, paths, flags and the `serve  <url>`, `workspace  <dir>`, `mcp  <url>`, `studio  <url>` lines are the same in both languages, and the English text that tests and documents quote is unchanged.

MCP approval titles name the operation as a command in the document's language (“导出文稿（网站、幻灯片）” / “Export Document (Website, Slides)”), without tool names, ids or internal names; the explanations of tool error codes follow the glossary and name no tool or field, and denied approvals, pending AI changes and missing permissions have one. The VS Code extension localizes its runtime messages through `vscode.l10n` (`l10n/bundle.l10n.zh-cn.json`).
