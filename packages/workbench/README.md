# @presmium/workbench

Presmium's workbench panels in React: the launcher of a workspace (its documents, made from a template, renamed, copied and deleted), a document's file tree, the source editor (CodeMirror 6, with a three-way merge when a file changed on disk), the problems of its compilation and its live preview (the web form or the slides, driven over Presmium's preview protocol). Under them, bound to no framework: the client of the workspace service (`presmium serve`), the workbench's state, the preview protocol's workbench side, and the shared components of Presmium's design (`PmButton`, `PmDialog`, `PmMenu` and the others) in React. Experimental (0.x).

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Usage

`presmium studio` shows these panels in DeepSeek Harness's web client: `@presmium/dsh` bundles them into its client part and places them. They know nothing of the host they are drawn in; a layout gives them one `Workbench` and places them:

```tsx
import { HomePanel, DocumentView, Workbench, WorkbenchProvider, workspaceClient } from '@presmium/workbench'
import '@presmium/design/design.css'
import '@presmium/workbench/styles.css'

const workbench = new Workbench({ client: workspaceClient('api/presmium/'), locale: 'zh-CN' })

export function Centre({ open }: { open: boolean }) {
  return <WorkbenchProvider workbench={workbench}>{open ? <DocumentView /> : <HomePanel />}</WorkbenchProvider>
}
```

The workspace service's routes are reached under the page's `api/presmium/` (the host passes them on to the service); React 18 is a peer dependency.

## Documentation

- [Design of the workbench on DeepSeek Harness](https://github.com/Lincyaw/presmium/blob/main/docs/design-dsh.md) (section 7)
- [Interfaces and versions](https://github.com/Lincyaw/presmium/blob/main/docs/api.md)

## License

Apache-2.0.
