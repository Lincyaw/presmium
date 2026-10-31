---
"@lincyaw/kernel": patch
"@lincyaw/compiler": patch
"@lincyaw/workspace": patch
"@lincyaw/addon-lecture": patch
"@lincyaw/viewer": patch
"@lincyaw/workbench": patch
---

Use step-bound Narration in lecture.json as the only lecture script source. Remove the external Markdown script reader and its rendering and voice exceptions. Reject the retired script configuration in document metadata, host headmatter and workspace settings with an explicit diagnostic; existing matching speech caches remain usable.
