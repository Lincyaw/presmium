---
"@lincyaw/workspace": patch
---

Refuse unsafe root-document directory operations and preserve document files, symbolic links, unrelated changes and the git index when project creation, renaming or deletion fails to commit. Bound temporary backups, distinguish expected refusals from filesystem failures, and retain protected recovery material with a typed error if filesystem rollback itself fails. Project preflight and MCP management are separate follow-up work.
