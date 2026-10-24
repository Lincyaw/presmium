---
'@lincyaw/kernel': patch
'@lincyaw/web': patch
'@lincyaw/server': patch
'@lincyaw/workspace': patch
'@lincyaw/workbench': patch
'@lincyaw/slidev-addon-guide': patch
'@lincyaw/slidev-addon-lecture': patch
'@lincyaw/slidev-addon-speech': patch
'@lincyaw/slidev-addon-motion': patch
---

Switching in the workbench is instant or nearly.

- `@lincyaw/slidev-addon-guide`, `@lincyaw/slidev-addon-lecture`, `@lincyaw/slidev-addon-speech`, `@lincyaw/slidev-addon-motion`: their previews are restartable (`presmium.preview.restartable`, and `restartable: true` on the kernel plugins), so a page switched away from is paused and resumed instead of loaded again. The lecture recorder is hidden in a workbench's preview.
- `@lincyaw/web`: a document's own modules count as restartable by the document's `package.json`, else the workspace's. In a workbench the presentation view is drawn as a slide on the canvas without presenting's controls; `<html>` has the `pm-in-workbench` class there. `SiteDevServer.target` gives the dev server of a path, and `warm` also warms the page.
- `@lincyaw/kernel`: `warmDevPage` asks a dev server for a page and its entry modules; `SiteDevServer.target`; `PreviewAnswer.prepared`.
- `@lincyaw/server`, `@lincyaw/workspace`: the site's paths go straight to their document's dev server; a slides prefetch answers once Slidev runs and its page is warmed, with `prepared`.
- `@lincyaw/workbench`: Present (the web form's own presentation, in the same page, switched at once) beside Document and Slides; prepared slides are loaded once out of sight before a switch; the document opened last is prepared when the workbench starts.
