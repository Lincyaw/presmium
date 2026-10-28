---
"@lincyaw/kernel": patch
"@lincyaw/mcp": patch
"@lincyaw/workbench": patch
"@lincyaw/workspace": patch
"@lincyaw/dsh": patch
---

Add explicit, version-bound MCP inspection and paged reading of the connected author's comment drafts. Keep passive client state free of draft content, reject stale reads before durable deletion finishes, and fit complete Unicode results within the existing WebSocket and MCP budgets.
