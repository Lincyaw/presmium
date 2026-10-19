# Presmium for VS Code

Presmium documents in VS Code: diagnostics, anchor navigation and completion from the Presmium language server, and a `presmium dev` preview that follows the cursor.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Features

- Diagnostics of `presmium check` after saving, on the lines they concern.
- Go to the definition of a code anchor (`region:`, `symbol:`, `pattern:`), hovers and completion of directives, options and anchors.
- **Open Preview to the Side** (in the editor's title bar for Markdown files): the web form of `presmium dev`, which follows the cursor.

## Install and preview

Download a `.vsix` for your operating system and processor from the [GitHub Releases](https://github.com/Lincyaw/presmium/releases) assets. Apple Silicon uses `darwin-arm64`, Intel Macs use `darwin-x64`; Windows and Linux each have `x64` and `arm64` packages.

In VS Code, run **Extensions: Install from VSIX…** and select the download. Reload the window if prompted. Open your lecture's `lecture.md`, then run **Presmium: Open Preview to the Side** from the Command Palette. The Presmium command is separate from VS Code's built-in Markdown preview. Save your changes to update the rendered page; moving the cursor to another section moves the preview there.

The installation includes the language server, compiler and web renderer. It needs Node.js 22.19 or later on your PATH; document-specific plugins still come from your project. It does not need Studio, DeepSeek Harness or a model.

## Settings

- `presmium.server.runtime`: the Node.js executable that runs the language server (Node.js 22.19 or later).
- `presmium.server.path`: the path of `presmium-language-server.mjs`; by default the one of `@presmium/language-server` installed in the workspace, else the extension's own.

## Building the extension

From the repository, after `pnpm install --frozen-lockfile`:

```sh
pnpm --filter presmium-vscode package:vsix
```

This writes `dist/presmium-vscode-<version>-<platform>-<arch>.vsix` inside this package. Build on the target operating system and architecture: the renderer's esbuild and Rollup dependencies include native binaries. The runtime is deployed from the workspace lockfile into ordinary directories and included in the archive; it has no symlinks back to this checkout. `pnpm --filter presmium-vscode build` only writes the extension host bundle, for extension development.

The **VS Code extension** GitHub Actions workflow builds and tests all six packages on pushes and pull requests affecting the packages. Manual runs provide workflow artifacts. Publishing a GitHub Release builds its tagged commit and attaches the tested `.vsix` files to that release. This workflow does not publish to the VS Code Marketplace or npm.

## License

Apache-2.0
