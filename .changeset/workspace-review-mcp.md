---
"@lincyaw/kernel": patch
"@lincyaw/workspace": patch
"@lincyaw/mcp": patch
"@lincyaw/server": patch
"@lincyaw/skills": patch
---

Expose bounded workspace review summaries, file diffs and accept/reject/checkpoint actions to external owner MCP clients. Bind approval to the exact candidate tree, publish immutable reviewed bytes and recheck after waiting for editor flush and workspace locks. Keep document assistants from approving their own changes.
