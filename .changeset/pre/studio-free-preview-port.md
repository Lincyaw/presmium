---
"@lincyaw/studio": patch
---

When port 4321 is taken (for example by another Studio) and no `--preview-port` was given, `presmium studio` starts on a free port and prints that the MCP address differs this time, instead of refusing to start.
