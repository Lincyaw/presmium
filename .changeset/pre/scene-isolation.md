---
"@lincyaw/web": patch
"@lincyaw/kernel": patch
"@lincyaw/compiler": patch
"@lincyaw/workspace": patch
---

A scene or component file that does not compile fails alone: the document's code is still bundled, the part that loads the file shows its failure (the file, the line and the bundler's reason) as a component failing at run time does, and every other page previews and presents. Each such file is a `presmium.preview.code` diagnostic, and `presmium check` (and MCP `check_document`) now bundles the document's code and reports each file that does not bundle as an error with its file and line, also in a project whose own package.json depends only on `@lincyaw/presmium`. `presmium build` reports them too. Renderers can check a document (`Renderer.check`), run with the document's checks.
