---
"@lincyaw/kernel": minor
"@lincyaw/workspace": minor
"@lincyaw/mcp": minor
"@lincyaw/server": minor
"@lincyaw/dsh": patch
"@lincyaw/addon-speech": patch
---

Share source-bound voice capabilities and real catalogue discovery between Web and MCP without waiting for scene compilation. Preserve actual engine declarations, unsupported catalogues and provider errors; reject source changes during discovery and close outstanding reads with the workspace owner. Shared speech catalogue requests retain independent borrowers and abort their provider request only when the last borrower leaves. Proxy the shared clip preflight and voice capability routes through Studio.
