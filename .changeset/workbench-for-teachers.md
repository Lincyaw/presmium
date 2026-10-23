---
'@lincyaw/workbench': patch
'@lincyaw/dsh': patch
'@lincyaw/kernel': patch
'@lincyaw/workspace': patch
'@lincyaw/design': patch
---

The workbench is for teachers who know no code: they edit the document as its readers see it, and every change is a version they can undo.

- `@lincyaw/workbench`:
  - The documents are listed, made, renamed and copied by title.
  - A document shows as its web form or slides, with a toolbar: Undo, Redo, whether it is saved, the view, Editing or Viewing, Comments and Version History.
  - Clicking a block or selecting text opens Edit text, New Comment and Rewrite with AI beside the mouse; a double-click edits text in place, mapped back to the source (`applyRenderedEdit`), and text that crosses formatting goes to the AI.
  - Comments are numbered on their blocks and go to the AI. Undo, Redo and Version History work by revision. Content that does not display is said plainly, with Fix with AI.
  - New: `DocumentView`, `CommentsPanel`, `HistoryPanel`, `PreviewPanel`, `applyRenderedEdit`, `documentDirFor`, `withTitle`, `hasSlides`, `isAgentChanging`, `timeAgo`, and the types `Pointer`, `SaveState`, `EditFallback`, `AgentRequest`, `WorkbenchMode`, `DocumentComment`. `Workbench` gains `editText`, `point`, `addComment`, `askAgent`, `askAgentAboutComments`, `undo`, `redo`, `revealSource`, `revealPlace`, `setMode`, `onAgentRequest`, `createDocument`, `copyDocument` and `retitleDocument`. `WorkspaceClient` gains `undo` and `redo`, and `saveSource` takes a summary.
  - Removed: the source editor, file tree, problems panel, changes panel, Quick Open and status items (`DocumentEditor`, `SourcePanel`, `FilesPanel`, `ProblemsPanel`, `ChangesPanel`, `QuickOpen`, `StatusItems`, `createEditor`, `mergeTexts`, `DocumentPane`, `WORKSPACE_SCOPE`, `isWorkspaceRootOpen`), with their dependencies (CodeMirror, node-diff3, cmdk, React Arborist).
- `@lincyaw/dsh`:
  - The activity bar keeps Documents and the AI assistant, with More (plugins, automation tasks), Settings and Help.
  - The chat history lists sessions without their workspace, and the conversation offers no other workspace or agent preset.
  - The conversation's placeholders speak to teachers. Rewrite with AI, comments and Fix with AI go to the current session. Links to a document's Markdown show that place in the document.
  - The routes `history/undo` and `history/redo` are passed on to the workspace service.
- `@lincyaw/kernel`:
  - The preview protocol's `edit` command and `editing`, `edited` and `rect` reports edit a block's text in place. `picked` and `selection` give their position.
  - `shortcut` carries `undo`, `redo` and `dismiss` instead of `open-files` and `open-commands`.
  - `SavedAnswer` gives the revision a save made, and `RevisionsAnswer` the next undo and redo.
- `@lincyaw/workspace`: every save in a git workspace is a revision. `history/undo` and `history/redo` walk a document's revisions. An agent's turn is committed when it ends unless `review: required` is set.
- `@lincyaw/design`: icons `comment`, `comment-add`, `chat`, `versions`, `eye`, `edit-text` and `resolved`.
