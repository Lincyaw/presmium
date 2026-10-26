# Presmium for VS Code

Edit canonical `lecture.json` documents in VS Code with the built-in JSON editor, shared schema completion, teaching graph diagnostics, code anchor navigation and a preview that follows the current page.

Part of [Presmium](https://github.com/Lincyaw/presmium), which derives web pages, slides, Jupyter notebooks and narrated playback from the same teaching document.

## Document authoring

Open a workspace containing `lecture.json`; the extension activates for these documents. For a standalone `lecture.json` file, run **Presmium: Open Preview to the Side**. The language client and editor action only select the canonical filename and VS Code's `json` language.

The extension associates `lecture.json` with `dist/lecture.schema.json`, generated at build time from the public `@lincyaw/kernel` `DOCUMENT_JSON_SCHEMA`. VS Code supplies JSON completion and documentation. The Presmium language server adds the same graph validation used by the compiler and source saves, including diagnostics for unsaved buffers.

Use **Go to Definition** on entity references such as `blockId`, `definitionId` or `stepOrder` to find the corresponding normalized entity. A code block's `origin.anchor` navigates to the actual project code and shows resolved code in a hover. After saving JSON or changing a watched project input, the language server recompiles the real document.

**Open Preview to the Side** saves pending JSON changes and starts `presmium dev`. Preview navigation follows the page owning the entity under the cursor, using stable IDs and JSON paths; map order and JSON formatting do not determine the page. The browser studio provides the native rich-text editor for this same document.

## Settings

- `presmium.server.runtime`: the Node.js executable that runs the language server (Node.js 22.19 or later).
- `presmium.server.path`: the path of `presmium-language-server.mjs`; by default the one of `@lincyaw/language-server` installed in the workspace, else the extension's own.

## Building the extension

From the repository, after `pnpm install --frozen-lockfile`:

```sh
pnpm --filter presmium-vscode package:vsix
```

This writes `dist/presmium-vscode-<version>-<platform>-<arch>.vsix` inside this package. Build on the target operating system and architecture: the renderer's esbuild and Rollup dependencies include native binaries. The runtime is deployed from the workspace lockfile into ordinary directories and included in the archive; it has no symlinks back to this checkout. `pnpm --filter presmium-vscode build` only writes the extension host bundle, for extension development.

The **VS Code extension** GitHub Actions workflow builds and type-checks all six packages on pushes and pull requests affecting the packages. Manual runs provide workflow artifacts. Publishing a GitHub Release builds its tagged commit and attaches the built `.vsix` files to that release. This workflow does not publish to the VS Code Marketplace or npm.

## License

Apache-2.0
