---
"@lincyaw/kernel": patch
"@lincyaw/workspace": patch
"@lincyaw/workbench": patch
"@lincyaw/mcp": patch
"@lincyaw/server": patch
"@lincyaw/dsh": patch
---

Share scoped, bounded document history and historical file reads between Web and MCP. Require saved-source, HEAD and explicit target checks for undo, redo and per-change reverts, preserve staged and dirty files, and recover original history pagination without truncating undo-chain state. Native editor history stays independent.
