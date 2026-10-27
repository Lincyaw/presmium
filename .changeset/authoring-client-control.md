---
"@lincyaw/kernel": patch
"@lincyaw/workspace": patch
"@lincyaw/server": patch
"@lincyaw/mcp": patch
"@lincyaw/workbench": patch
"@lincyaw/dsh": patch
"@lincyaw/addon-lecture": patch
---

Add bounded, source-bound browser client actions over Studio's shared connection. MCP reads actual client state, requests explicit source flush, stable step selection or existing playback controls, and reads browser acknowledgements without treating request admission as completion. Unsupported recording and draft actions stay unavailable.
