---
"@lincyaw/web": patch
"@lincyaw/skills": patch
"create-presmium": patch
---

A document that names a new plugin while `presmium studio` or `presmium serve` is running presents again without a restart: its code is bundled with the plugin's modules shared by name (a project need not resolve `@lincyaw/addon-motion/scene` itself), also when a build for the earlier plugins was still running. Run from the repository, `presmium new` and the skills (installation, MCP, Studio) read the templates and skills from their sources rather than from copies left by an earlier pack.
