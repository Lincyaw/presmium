---
"@lincyaw/kernel": patch
"@lincyaw/mcp": patch
"@lincyaw/server": patch
"@lincyaw/workspace": patch
"@lincyaw/workbench": patch
---

Include selected workspace code in the teacher's conversation context, with its workspace-relative path, line range, saved excerpt and selected draft text. Explicit workspace scope reuses the source editor's file checks and requires the owner role; document-relative focus and document-bound MCP tokens keep their existing behavior.

Reject backslash paths consistently in source reads, saves, creation and workspace focus so Windows path normalization cannot escape the workspace.
