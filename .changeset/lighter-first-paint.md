---
'@lincyaw/kernel': patch
'@lincyaw/host': patch
'@lincyaw/viewer': patch
'@lincyaw/web': patch
'@lincyaw/addon-lecture': patch
---

A page or presentation downloads about half the JavaScript before it shows anything (the promo film's presentation: 526 KB to 295 KB gzipped, 67 to 47 requests before its first scene). The kernel and host declare their modules free of side effects, so a page no longer carries JSON Schema validation, JSON patches, the HTML parser or Radix's menus and radio groups it does not use; the workbench's preview protocol loads only in an embedded page; the HTML parser for HTML written in Markdown, the parsers of code outputs, the HTML writer of highlighted code and the animation between code variants load when a document uses them (before the first render, so the server's render and the browser's agree); a lecture's video encoders load with the first recording; and what every page runs first is one file instead of dozens.
