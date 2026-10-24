---
'@lincyaw/kernel': minor
'@lincyaw/web': minor
'@lincyaw/viewer': patch
'@lincyaw/design': patch
'@lincyaw/workspace': minor
'@lincyaw/workbench': patch
'@lincyaw/slidev-addon-motion': patch
---

The workbench shows the web form in a prebuilt viewer, as a PDF viewer shows any PDF: no dev server per document.

- `@lincyaw/web`: the viewer app (the web form's runtime with the workspace's plugins, built once into the user's cache and shared by every workspace) and each document's own code in a small bundle that imports Vue, Presmium's packages and the plugins' public subpaths through the app's import map. The workspace site serves them below `<base>__app/` (`SiteDevServer.app`); a document whose plugins bring Vite plugins of their own still goes to its dev server. A document's typography is our own stylesheet (`.pm-document`), the same on the site and in the viewer.
- `@lincyaw/kernel`: `PresmiumNodePlugin.documentModules`, the virtual modules a plugin generates for each document, which the viewer takes from the document's bundle; `SiteDevServer.app`; `PREVIEW_APPEARANCE_PARAM` and `previewAppearance()`, so that a preview's first paint has the workbench's appearance.
- `@lincyaw/slidev-addon-motion`: gives the document's scenes as a document module.
- `@lincyaw/workspace`: `preview` answers the viewer's page once it is built (an opened document waits for it a while; a prefetch only starts it), else the dev server's.
- `@lincyaw/workbench`: previews load with the workbench's appearance in their address.
- `@lincyaw/viewer`: the page view's root has the `pm-document` class.
- `@lincyaw/design`: `--pm-space-12`.
