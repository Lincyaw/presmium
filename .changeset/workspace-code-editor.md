---
"@presmium/workbench": patch
"@presmium/dsh": patch
"@presmium/workspace": patch
---

Browse and edit text files relative to the opened workspace, including code outside the current lecture directory. Opening a shared code file or root note keeps the lecture preview and existing drafts, and saves through the workspace's versioned source routes.

Do not treat directories matching a lecture glob as actual lectures when they have no entry file. Include their code in the workspace file tree and save it as workspace files.
