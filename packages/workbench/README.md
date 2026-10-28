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

## On the page

The document toolbar holds the navigation pane, Undo and Redo, whether the document is saved, Video production, Captions, Comments, Version History, Presentation preview and Export. Below 768 px, Video production, Captions and Version History move into a More menu so the toolbar stays on one row.

The names follow Microsoft Word's, in Chinese and English.

The document is one continuous editor: the author types in place and the change is saved after a short pause. Selecting text opens the formatting toolbar, which includes Add comment. Generated content (components and diagrams) shows its preview, not its source; authors change it through its properties or the AI assistant.

Every save is a version. Undo and Redo (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z) walk the versions, and Version History undoes any one of them.

The AI's turns become versions too. When the workspace asks to review them (`review: required`), the author accepts or rejects them first.

Comments are saved in the document with the text they point at. The Comments panel lists them; each can be replied to, reacted to, resolved and reopened.

Presentation preview shows the slides with the arrow keys and `Esc` working at once; `Esc` first closes an open menu or dialog, then leaves the presentation.

Operations that an outside AI tool asks to perform appear as Approvals in the app bar, where the author allows or denies them.

The workbench hands requests to the conversation through `workbench.onAgentRequest`; the host binds that to its agent session. Hosts route links to a document's source through `workbench.revealSource(path, line)`, which opens that document and outlines the block at the line.

## Documentation

- [Design of the workbench on DeepSeek Harness](https://github.com/Lincyaw/presmium/blob/main/docs/design-dsh.md) (section 7)

## License

Apache-2.0.
