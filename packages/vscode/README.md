# Presmium for VS Code

Presmium documents in VS Code: diagnostics, anchor navigation and completion from the Presmium language server, and a `presmium dev` preview that follows the cursor.

Part of [Presmium](https://github.com/presmium/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Features

- Diagnostics of `presmium check` as you type, on the lines they concern.
- Go to the definition of a code anchor (`region:`, `symbol:`, `pattern:`), hovers and completion of directives, options and anchors.
- **Open Preview to the Side** (in the editor's title bar for Markdown files): the web form of `presmium dev`, which follows the cursor.

## Settings

- `presmium.server.runtime`: the Node.js executable that runs the language server (Node.js 22.18 or later).
- `presmium.server.path`: the path of `presmium-language-server.mjs`; by default the one of `@presmium/language-server` installed in the workspace, else the extension's own.

## Building the extension

The extension is the one bundled package of the repository: `pnpm --filter presmium-vscode build` writes `dist/extension.cjs`. It is packed as a `.vsix` for the extension marketplace and is not published to npm.

## License

Apache-2.0
