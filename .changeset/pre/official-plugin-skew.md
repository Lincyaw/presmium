---
"@lincyaw/compiler": patch
"@lincyaw/cli": patch
"@lincyaw/mcp": patch
---

An official plugin (`@lincyaw/*`) that the running Presmium also provides runs from Presmium's own installation when the project installed another version: a project still on an older `@lincyaw/addon-motion` no longer breaks every scene with "no host installed" under a newer `presmium`, and a warning says to update the project's packages or run its own `pnpm exec presmium`. `presmium serve` no longer prints a notice about FFmpeg at every start; a lecture video export still says when it is missing. The MCP instructions of `presmium dev` say that author actions and pictures need `presmium serve` or Studio.
