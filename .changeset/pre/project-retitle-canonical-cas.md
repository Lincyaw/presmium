---
"@lincyaw/kernel": patch
"@lincyaw/workspace": patch
"@lincyaw/mcp": patch
---

Keep project title edits available for single-document and no-Git workspaces by delegating retitle plans to the existing canonical DocumentEditor CAS. Report capabilities per action, preserve exact document-token scope and review/origin checks, and omit Git snapshot fields when no real commit exists. Directory management retains its existing workspace/Git gates and transaction owner.
