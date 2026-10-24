---
'@lincyaw/render-slides': major
'@lincyaw/web': minor
'@lincyaw/viewer': minor
'@lincyaw/host': major
'@lincyaw/kernel': major
'@lincyaw/compiler': minor
'@lincyaw/workspace': minor
'@lincyaw/workbench': patch
'@lincyaw/addon-publish': major
'@lincyaw/addon-exec': minor
'@lincyaw/addon-exec-jupyter': minor
'@lincyaw/addon-exec-wasi': minor
'@lincyaw/addon-exec-webgpu': minor
'@lincyaw/addon-motion': minor
'@lincyaw/addon-content': minor
'@lincyaw/addon-stage': minor
'@lincyaw/addon-assistant': patch
'@lincyaw/addon-classroom': patch
'@lincyaw/addon-guide': patch
'@lincyaw/addon-session': patch
'@lincyaw/addon-speech': patch
'@lincyaw/presmium': minor
---

The slides no longer use Slidev. They are the viewer's own slides page: each section a slide on a canvas of a fixed size (980 wide and 16:9 unless `renderers.slides` says otherwise), drawn in the Book layout and scaled as a whole, from the same prebuilt viewer app as the web form. A section's `{hints} slides:` takes `layout` (`default`, `cover`, `center`, `full`), `class` and `zoom`.

- `presmium build --to slides` takes about 2 s for a lecture; `presmium dev --to slides` and the workbench's slides preview are the viewer's page with `?form=slides` (a switch from the document to the slides in the workbench takes about 0.15 s), and an edit reaches the slide as the sections it changed.
- The exports print that page in Chromium (`playwright-chromium`, an optional peer of `@lincyaw/render-slides`): `pdf`, `png` (a picture of each slide, or of each step) and `pptx` (a picture of each slide, its narration as the speaker notes, with `pptxgenjs`). `presmium-export` and `presmium-diff` use them; `presmium-export` no longer takes `--wait`, since the page tells when it is ready.
- The exporters' context builds a renderer's output (`ExportContext.build`, in place of `prepare`) and carries the asker's `options`; the compiler's `exportDocument` runs an exporter, for the workspace's jobs and for the command line.
- Removed: `@lincyaw/addon-core` (the slides' host adapter; a headmatter that still lists it compiles, with a note), every plugin's `setup/` and Slidev layers, the plugins' `vitePlugins` (a plugin's `vite.config.ts` gives the viewer app's build its Vite plugins and Vue's `isCustomElement`), `Renderer.prepare`, `RenderContext.vitePlugins`, the host's `PmStepScope`, the kernel's `servedAssets`, `prebundleDependencies`, `warmDevPage` and `linkBrowserDependencies`, the publish addon's PWA build of the slides, and the slides' themes.
