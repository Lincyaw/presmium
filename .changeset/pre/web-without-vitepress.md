---
'@lincyaw/web': minor
'@lincyaw/viewer': minor
'@lincyaw/host': minor
'@lincyaw/kernel': minor
'@lincyaw/compiler': patch
'@lincyaw/design': minor
'@lincyaw/addon-exec': minor
'@lincyaw/addon-exec-wasi': minor
'@lincyaw/addon-exec-webgpu': minor
'@lincyaw/addon-classroom': patch
'@lincyaw/addon-lecture': patch
'@lincyaw/addon-session': patch
'@lincyaw/addon-publish': patch
'@lincyaw/render-slides': patch
---

The web form no longer uses VitePress. One prebuilt viewer (the web form's runtime with the plugins' browser parts, built once for a set of plugins and kept in the user's cache) shows every page: in the workbench, in `presmium dev` and `presmium serve`, and in a built site, whose pages it renders on the server first and then hydrates. A document is data beside it: its IR, its own code as a small bundle, its search index, its published files. Our own site shell replaces VitePress's: header and navigation, chapters, the page's sections, pager, footer, search (MiniSearch over the IR, Chinese tokenized), languages, light and dark, the phone layout, the workspace's home page and a 404 page; it is drawn with the design tokens only.

- A build of one lecture's web form takes about 2 s instead of about 25 s, and a workspace site copies the viewer once below `_app/` for all its documents; the bytes are the same in any checkout.
- `presmium dev` and `presmium serve` start no VitePress process; an edit reaches the page as the sections it changed, and the viewer renders only those again.
- Plugins declare the files their browser code loads while it runs as `assets` (`RuntimeAssets`: served below the document's site path and copied into a built site); the browser code finds them with the host's `siteBase()`. A document's IR is served and built as `ir.json`, its revision in the `Presmium-Revision` header of a dev server.
- Removed: the `@lincyaw/web/client` VitePress theme export and the per-document VitePress projects.
