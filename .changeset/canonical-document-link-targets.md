---
"@lincyaw/compiler": patch
---

Validate cross-document section, block, rich-text and footnote link targets from canonical TeachingDocument JSON. Directory links resolve lecture.json; invalid target documents cannot supply anchors. Remove the old MyST parser path from runtime link validation.
