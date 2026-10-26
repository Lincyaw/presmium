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

The toolbar holds:

- Back, the title, Undo and Redo, and whether the document is saved;
- the view (Document or Slides, when the document has slides) and the mode (Editing or Viewing);
- Comments and Version History.

The names follow Microsoft Word's, in Chinese and English.

In Editing mode, hovering outlines a block. Clicking a block or selecting text opens a toolbar beside the mouse with Edit text, New Comment and Rewrite with AI.

Double-clicking a text block edits it in place. Enter keeps the edit and Esc puts the text back. The edit is written back to the block's source lines (`applyRenderedEdit`). Text that crosses formatting is offered to the AI instead, since writing it back would break the formatting.

In Viewing mode the document behaves as it does for its readers.

Every save is a version. Undo and Redo (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z, also while the document has the focus) walk the versions. Version History undoes any one of them, or redoes it.

The AI's turns become versions too. When the workspace asks to review them (`review: required`), the author accepts or rejects them first.

Comments are notes for the AI. The author writes them one by one, and they wait, numbered on their blocks, until the author sends them: Send N comments to AI in the toolbar puts them in one message. The AI's changes become a version. Comments are kept in the browser, by workspace and document.

The workbench hands requests to the conversation through `workbench.onAgentRequest`; the host binds that to its agent session. These requests are Rewrite with AI, comments, and fixing content that does not display. Hosts route links to a document's Markdown through `workbench.revealSource(path, line)`, which opens that document and outlines the block at the line.

## Documentation

- [Design of the workbench on DeepSeek Harness](https://github.com/Lincyaw/presmium/blob/main/docs/design-dsh.md) (section 7)

## License

Apache-2.0.
