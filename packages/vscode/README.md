# Presmium for VS Code

Use VS Code's native JSON and code editors for everyday authoring, with shared schema completion, teaching graph diagnostics, entity and code-anchor navigation, live preview and presentation. Open the shared visual editor when you need page layout, assets, the AI Assistant, narration, production or exports. Both entrances edit the same `lecture.json` and project files.

Requires VS Code Desktop 1.142 or later and Node.js 22.19 or later. Editing, preview and presentation do not need a model. AI and speech features use the same settings and service prerequisites as browser Studio.

## Author a document

Open a trusted workspace containing `lecture.json`. VS Code supplies JSON completion from the schema generated directly from the public kernel `DOCUMENT_JSON_SCHEMA`. The bundled language server adds compiler and graph diagnostics, including diagnostics for unsaved buffers. Use **Go to Definition** on entity references, or on a code block's `origin.anchor`, to navigate to the authoritative JSON entity or project code.

The editor toolbar and Command Palette provide:

- **Presmium: Open Preview to the Side**: save the current JSON document, start its live preview and open the current page in VS Code's Integrated Browser. Saved changes and watched project inputs update the preview. Run the command again to locate the page under the cursor.
- **Presmium: Present Document**: save the current JSON document and open the same viewer's presentation, initially at the current page.
- **Presmium: Open Visual Editor**: save the current JSON document and open the browser Studio in VS Code. The first opening selects that document and page; an already open document keeps its current editing, production or presentation view. From the Command Palette without a document, select a workspace or folder.
- **Presmium: Stop Visual Editor**: stop the local Studio processes started by this extension. Closing the VS Code window also releases its language service, previews and Studios.
- **Presmium: Install Project Skills**: install the four bundled authoring, animation, presentation and plugin-development skills in the selected project’s `.agents/skills`. Existing entries are preserved. Also available from a folder’s Explorer context menu, before a document exists.

The visual editor is the same application as `presmium studio`: rich text, pages, components, assets, comments, history, AI, narration, voiceover, production and available export targets all use the shared implementation. Export prerequisites and capability limits are the same as in the browser. Documents and output files stay in the project; the extension does not keep a separate content model. Native unsaved JSON is saved before an explicit preview or visual-editor opening; subsequent concurrent changes use the existing document-version and conflict checks.

The extension uses a real Integrated Browser tab, so Studio authentication, WebSockets and downloads follow the normal browser flow. It does not relax the local services' request checks. If the host does not expose the Integrated Browser command, the page opens in the default browser. Remote-SSH and container port forwarding use VS Code's `asExternalUri`; those hosts need separate acceptance on their actual platform.

## Skills for agents

The VSIX includes `presmium-author`, `presmium-animate`, `presmium-present` and `presmium-develop`, with reference files and animation scene sources. Browser Studio registers these same files through `@lincyaw/skills`. Use **Install Project Skills** for an agent that discovers project skills from disk; this leaves the agent’s global configuration alone. With Presmium installed in a project, the equivalent command is `pnpm exec presmium skills install . --json`.

An external MCP agent can call `list_skills` and `read_skill`, or read `presmium://skills` and its listed file resources. Follow `nextOffset` for long files and read the references needed for the task. Skills are available when the MCP server starts in an existing empty directory. Connecting exposes the catalog and server instructions; the client decides when to load a skill. MCP does not automatically install skills into every agent.

## Settings

- `presmium.server.runtime`: the Node.js executable for the language server and Studio (Node.js 22.19 or later).
- `presmium.server.path`: an optional `presmium-language-server.mjs` path. By default, use the workspace-installed language server, otherwise the bundled one.

These executable settings belong to the machine. Presmium stays disabled in untrusted or virtual workspaces because project compilation and authoring can execute project code. Startup failures offer **Show Output** for the Presmium diagnostic channel. Studio uses the same state directory, sessions and model settings as browser Studio.

## Build and install

From this repository, after `pnpm install --frozen-lockfile`:

```sh
pnpm --filter presmium-vscode package:vsix
```

Install the resulting `dist/presmium-vscode-<version>-<platform>-<arch>.vsix` with VS Code's **Extensions: Install from VSIX**. The package contains the language server, compiler, renderers and complete Studio runtime, including its built client and all four shared skills; it does not require a separate Studio installation. A compatible workspace installation is preferred when present. The full Studio runtime makes this package larger than the preview-only extension.

Build on the target operating system and architecture: runtime dependencies include native binaries. Production dependencies are deployed from the lockfile into ordinary directories with no symlinks back to this checkout. The explicit package file list excludes existing VSIX archives from the deployed runtime. `pnpm --filter presmium-vscode build` only writes the extension host bundle and document schema for extension development.

The **VS Code extension** GitHub Actions workflow packages and type-checks six platform variants. It does not run the real-window acceptance described below. Publishing a GitHub Release builds its tag and attaches all six VSIX files. For an existing release, run the workflow manually with `release_tag` set to that release’s tag; it checks out that tag and uploads the platform files to the existing release. Leave the input empty to produce workflow artifacts only. The workflow does not create a release or publish to the Marketplace or npm.

## Acceptance

Verify the installed VSIX outside this repository with a small project: schema completion, unsaved diagnostics and recovery, entity/code navigation, saved-input refresh, preview and presentation, visual-editor document selection and shared exports. Check the visual editor in light and dark, on desktop and below 768 px. Stop the visual editor and close the window, then confirm their ports are released. Service probes and successful packaging do not replace a real VS Code window check.

## License

Apache-2.0
