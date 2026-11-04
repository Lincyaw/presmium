---
"@lincyaw/studio": patch
"@lincyaw/dsh": patch
"@lincyaw/server": patch
"@lincyaw/skills": patch
---

Keep Studio HTTP MCP on fixed port 4321 and preserve per-workspace external credentials across restarts and upgrades. Print the MCP address and credential-file location, and report port conflicts instead of silently changing the address.
