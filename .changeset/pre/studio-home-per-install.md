---
"@lincyaw/studio": patch
---

Studios of different installations (two versions, or two checkouts) can run at the same time: each has its own DeepSeek Harness profile, `presmium-studio-<hash>` under `$XDG_STATE_HOME/presmium/studio/profiles`, linked to its own `@lincyaw/dsh`, and its own log `presmium-studio-<hash>.log`, so starting one no longer makes the other load its code or empties its log. Sessions and credentials stay shared; a new installation's profile starts with the settings of the profile used last, the earlier single `presmium-studio` included, so an author keeps their settings after an upgrade.
