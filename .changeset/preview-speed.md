---
'@lincyaw/kernel': patch
'@lincyaw/web': patch
'@lincyaw/render-slides': patch
'@lincyaw/addon-motion': patch
'@lincyaw/server': patch
'@lincyaw/workspace': patch
'@lincyaw/workbench': patch
'@lincyaw/dsh': patch
---

Previews open several times faster.

- `@lincyaw/kernel`: two classes of children. `interactive` ones (what the author waits for) take their threads from the machine's state now (`threadBudget`, `machineState`, `spawnInteractiveNode`, `nodeResourceArgs`) at normal priority; `background` ones keep the old budget. Also `importSpecifier` and `literalGlob`, and `SiteDevServer.warm`. The preview frame's style no longer stays in static builds.
- `@lincyaw/web`, `@lincyaw/render-slides`: the dev servers of the previews run as interactive children. A document site pre-bundles its dependencies at once: the generated theme is the scan entry, its imports are relative, and the server warms it up. `warm` starts a document's dev server ahead of its first request, while fewer than three run.
- `@lincyaw/addon-motion`: the deck's scene files are dependency-scan entries, so GSAP, Three.js, React and the others are pre-bundled before the page loads instead of reloading it.
- `@lincyaw/server`, `@lincyaw/web`: the proxies to the dev servers keep their connections alive.
- `@lincyaw/workspace`: `preview?prefetch=1` prepares a document (its web dev server, or its slides) only when the machine has room (`roomToPrefetch`).
- `@lincyaw/workbench`: when the mouse rests on a document, or the focus reaches it, the workbench has it prepared. When the author stays on a web form, its slides start in the background.
- `@lincyaw/dsh`: the workspace service and DeepSeek Harness start as interactive processes.
