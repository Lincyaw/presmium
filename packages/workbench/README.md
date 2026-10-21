# @lincyaw/workbench

Presmium's workbench panels in React: the launcher of a workspace (its documents, made from a template, renamed, copied and deleted), a document's file tree, the source editor (CodeMirror 6, with a three-way merge when a file changed on disk), the problems of its compilation, its live preview (the web form or the slides, driven over Presmium's preview protocol) and its changes (an agent's change waiting for review, the changes not committed, the history and its undo). Under them, bound to no framework: the client of the workspace service (`presmium serve`), the workbench's state, the preview protocol's workbench side, and the shared components of Presmium's design (`PmButton`, `PmDialog`, `PmMenu` and the others) in React. Experimental (0.x).

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Usage

`presmium studio` shows these panels in DeepSeek Harness's web client: `@lincyaw/dsh` bundles them into its client part and places them. They know nothing of the host they are drawn in; a layout gives them one `Workbench` and places them:

```tsx
import { HomePanel, DocumentView, Workbench, WorkbenchProvider, workspaceClient } from '@lincyaw/workbench'
import '@lincyaw/design/design.css'
import '@lincyaw/workbench/styles.css'

const workbench = new Workbench({ client: workspaceClient('api/presmium/'), locale: 'zh-CN' })

export function Centre({ open }: { open: boolean }) {
  return <WorkbenchProvider workbench={workbench}>{open ? <DocumentView /> : <HomePanel />}</WorkbenchProvider>
}
```

The workspace service's routes are reached under the page's `api/presmium/` (the host passes them on to the service); React 18 is a peer dependency. Interactive controls wrap Radix Primitives; cmdk owns command search, React Arborist owns the file tree, and react-resizable-panels owns pane resizing. Presmium maintains the visual tokens and the document, save, review and preview behavior, rather than duplicating these libraries' focus, keyboard, positioning and drag logic. The file tree follows VS Code's Explorer: folders start closed, keep their open state per workspace or document, sort before files, and open a file's folders and scroll to it when a source is opened elsewhere.

Documents open a Document preview tab. Source files, Document preview and Slides preview share a resource tab strip. Opening a file activates its editor; Open preview chooses a rendered resource, and Open preview to the side explicitly creates a second group. Merge editor groups returns the preview to the main group. Closing a preview keeps the selected lecture and source drafts. Text selections and picked preview blocks become conversation context. `WorkbenchProvider` protects unsaved changes when closing files, leaving a document or unloading the page. Set `protectChanges={false}` on auxiliary providers when several panels share one workbench, keeping the protection mounted once in its primary provider.

Hosts route text file references through `workbench.openSource(document, path, { line })`. The file tree and source reads and saves use the opened workspace's scope (`''`), including code outside the current lecture directory. Opening shared code or root notes keeps the selected lecture preview and existing drafts; switching lectures still protects unsaved changes. Without a selected lecture, root files open in source mode. Keep `DocumentView` mounted when hiding it so editor drafts and undo history survive navigation.

The editor highlights Python files and Python code fences in Markdown. Python files indent by four spaces after a block header. Tab indents and Shift+Tab unindents; press Escape followed by Tab to move keyboard focus out of the editor. Ctrl+M (Shift+Alt+M on macOS) toggles Tab focus mode. Ctrl+S (Command+S on macOS) saves the active file, and each file tab keeps its own draft and undo history.

The Explorer's New file button creates an empty text file at a path relative to the workspace, creates missing directories and opens it in the same editor. It keeps the selected lecture and other drafts. Creation refuses existing paths and symbolic link parents; subsequent saves still require the version opened from disk.

Selecting code outside the lecture directory gives the conversation an explicit workspace source range. Its path is relative to the workspace root; the selected quote includes unsaved text, while the excerpt comes from the saved file. The selected lecture still owns the conversation context, and clearing the selection or switching lectures removes it from the current context.

## Documentation

Quick Open in the activity bar works throughout the workbench: Ctrl/Cmd+P searches workspace files and documents, `file.py:12` jumps to a line, and Ctrl/Cmd+Shift+P searches existing commands. The preview bridge forwards these two shortcut intents when the iframe has focus. Escape returns focus to the original input, and document changes still protect unsaved drafts.

- [Design of the workbench on DeepSeek Harness](https://github.com/Lincyaw/presmium/blob/main/docs/design-dsh.md) (section 7)

## License

Apache-2.0.
