---
"@lincyaw/viewer": patch
"@lincyaw/compiler": patch
---

A `scrolly` page of the reading version shows each step's narration in its step track, which stayed empty for documents that keep narration in `narrations`. A document's production defaults no longer add the lecture form to its renderers: a workspace whose document lists only `web` and `slides` builds its slides instead of failing with "renderer lecture is not installed". The viewer passes a list of children as fixed content and marks its `contenteditable` controls, so server rendering no longer prints a React warning for each.
