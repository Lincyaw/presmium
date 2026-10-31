---
'@lincyaw/kernel': patch
'@lincyaw/compiler': patch
'@lincyaw/addon-motion': patch
'@lincyaw/design': patch
'@lincyaw/viewer': patch
'@lincyaw/workbench': patch
'@lincyaw/workspace': patch
'@lincyaw/dsh': patch
---

Unify document authoring around body blocks, generated content with source/preview views, and step narration. Edit a generated block's own code or MyST configuration without replacing its animation. Keep drafts across view changes and code reloads, report syntax errors and version conflicts, and retain the selected step.

New animation blocks create independent source files and document references in one versioned transaction. Failed transactions restore files and the Git index; one undo removes both related changes.
