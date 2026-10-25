---
'@lincyaw/kernel': patch
'@lincyaw/viewer': patch
'@lincyaw/workbench': patch
'@lincyaw/dsh': patch
'@lincyaw/workspace': patch
---

Add New page to the page list and native block menu. Save pending body edits before inserting an independent, labeled page after the current one, then focus its editor after compilation. Retain source and narration, support undo and redo, and reject ambiguous source boundaries.

Preserve an authored UTF-8 BOM when reading and saving source files.
