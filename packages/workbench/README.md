# @lincyaw/workbench

Presmium's workbench panels in React, for teachers who know no code. The panels are:

- the documents of a workspace, listed by title (made from a template, renamed, copied and deleted by title);
- a document shown as its readers see it (the web form or the slides, driven over Presmium's preview protocol), edited right on the page;
- the document's comments and its version history.

Under them, bound to no framework, are the client of the workspace service (`presmium serve`), the workbench's state, the mapping of an edit on the page back to the source, the preview protocol's workbench side, and the shared components of Presmium's design (`PmButton`, `PmDialog`, `PmMenu` and the others) in React. Experimental (0.x).

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Usage

`presmium studio` shows these panels in DeepSeek Harness's web client: `@lincyaw/dsh` bundles them into its client part and places them. They know nothing of the host they are drawn in. A layout gives them one `Workbench` and places them:

```tsx
import { DocumentView, HomePanel, Workbench, WorkbenchProvider, workspaceClient } from '@lincyaw/workbench'
import '@lincyaw/design/design.css'
import '@lincyaw/workbench/styles.css'

const workbench = new Workbench({ client: workspaceClient('api/presmium/'), locale: 'zh-CN' })

export function Centre({ open }: { open: boolean }) {
  return <WorkbenchProvider workbench={workbench}>{open ? <DocumentView /> : <HomePanel />}</WorkbenchProvider>
}
```

The page reaches the workspace service's routes under its own `api/presmium/` path; the host passes them on to the service. React 18 is a peer dependency. Dialogs and menus wrap Radix Primitives. Presmium maintains the visual tokens, the editing, the versions and the preview.

A host exposing a subset of the workspace service can set `client.capabilities` before constructing `Workbench`: `{ diagnostics: 'none', production: false, narration: false, export: false, readOnly: true }`. This disables diagnostic subscriptions and reports, hides the corresponding document controls, and makes the source session and canonical write requests read-only. Omitted fields preserve the local workspace's complete behavior. Hosts explain unavailable services in their own interface and enforce authorization on every server request. The optional third `workspaceClient` argument, `{ fetch }`, provides an instance-specific transport for authentication headers.

`client.capabilities.readOnly: true` also disables canonical document writes, including source transactions, asset imports, comments, page operations and history changes. The source actor and editor controls share this restriction; the service still checks the authenticated member on every request.

`DocumentView` keeps the document title, toolbar, editor and preview in one shared view. Its optional `onBack()` callback replaces the default return to the workspace's document list. `actions` places host controls, such as sharing, beside the document's own commands; hosts provide localized accessible names and use the public workbench controls.

`historyRevisionAction` adds an explicit host operation to the existing Version History rows. It uses the exported `HistoryRevisionAction` configuration: `label`, optional `icon`, `onSelect(revision)`, optional `disabled` (a boolean or a predicate of the revision), and optional `pendingRevision` (the opaque revision ID being processed). The standalone `HistoryPanel` accepts the same configuration as `revisionAction`. The host owns confirmation, source flushing, authorization, conflict checks and request recovery; it controls pending state while the shared panel disables its other history operations and pagination. Read-only clients cannot activate the action.

An absolute snapshot restore is separate from selective undo. A host that stores full snapshots can return `revertible: false` in its history rows and supply a clearly named restore action. Treat revision IDs as opaque references and resolve them on the server; do not reinterpret them in the browser or fetch another history list. Reuse the ordinary compilation and presentation flow, which checks the exact saved source, fingerprint and revision before showing a presentation.

## On the page

The document toolbar holds the navigation pane, Undo and Redo, whether the document is saved, Video production, Captions, Comments, Version History, Presentation preview and Export. Below 768 px, Video production, Captions and Version History move into a More menu. When the view owns its title (`framed` is false), Back and the title use their own row; Undo, Redo and Comments join the same More menu so the main commands fit within the available width. A framed view retains its existing single command row.

The names follow Microsoft Word's, in Chinese and English.

The document is one continuous editor: the author types in place and the change is saved after a short pause. Selecting text opens the formatting toolbar, which includes Add comment. Generated content (components and diagrams) shows its preview, not its source; authors change it through its properties or the AI assistant.

Every save is a version. Undo and Redo (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z) walk the versions, and Version History undoes any one of them.

The AI's turns become versions too. When the workspace asks to review them (`review: required`), the author accepts or rejects them first.

Comments are saved in the document with the text they point at. The Comments panel lists them; each can be replied to, reacted to, resolved and reopened.

Presentation preview shows the slides with the arrow keys and `Esc` working at once; `Esc` first closes an open menu or dialog, then leaves the presentation.

Operations that an outside AI tool asks to perform appear as Approvals in the app bar, where the author allows or denies them.

The workbench hands requests to the conversation through `workbench.onAgentRequest`; the host binds that to its agent session. Hosts route links to a document's source through `workbench.revealSource(path, line)`, which opens that document and outlines the block at the line.

## Documentation

- [Design of the workbench on DeepSeek Harness](https://github.com/Lincyaw/presmium/blob/main/docs/studio.md) (section 7)

## License

Apache-2.0.
