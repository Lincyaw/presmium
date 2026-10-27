---
"@lincyaw/kernel": patch
"@lincyaw/workspace": patch
"@lincyaw/server": patch
"@lincyaw/mcp": patch
"@lincyaw/workbench": patch
"@lincyaw/dsh": patch
---

Share source-bound project preflight and application between Web and MCP. Fix new document identities before creation or copying, confirm deletions against a bounded impact plan, preserve classified references, and reject stale trees, unsupported scope and permission/review bypasses. Reuse the existing directory transaction and failure recovery; unsafe workspace-root directory operations remain unavailable.

Preserve local pinned code-reference tuples on copy and refuse directory relocation that would break their historical paths. Clarify that opaque plugin data and scene imports remain unchanged rather than being detected or rejected.
