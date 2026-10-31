---
"@lincyaw/addon-code": patch
---

Treat local source references without a Git remote as normal: show their code without an optional permalink and stop emitting a diagnostic for it. Missing source, anchor drift and execution failures remain reported.
