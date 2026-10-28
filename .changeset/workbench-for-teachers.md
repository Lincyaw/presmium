---
'@lincyaw/workbench': patch
'@lincyaw/dsh': patch
'@lincyaw/kernel': patch
'@lincyaw/workspace': patch
'@lincyaw/design': patch
---

The workbench is for teachers who know no code: they write the document in one continuous editor, and every save is a version they can undo.

- `@lincyaw/workbench`:
  - Documents are listed on the home page by title, and are made from a template, renamed, copied and deleted by title. A new document opens on one blank page, ready for typing.
  - The Pages pane lists the document's pages by number and title; pages are added, copied, renamed, moved (by pointer, touch or keyboard) and deleted there.
  - The document is one editor: the author types in place and the change is saved after a short pause. Selecting text opens the formatting toolbar: styles, links, inline formulas, text and background colours from a semantic palette (the same colours in the editor and the published pages, light and dark) and Add comment. The slash menu inserts blocks such as headings, lists, tables, images and formula blocks. Formulas show typeset and are edited in a popup with a live preview.
  - Generated content (animations, components and diagrams) shows its picture, not its source; the author changes it through its properties or the AI assistant.
  - The toolbar holds the Pages pane, Undo and Redo, whether the document is saved, Video production, Captions, Comments, Version History, Presentation preview and Export. Below 768 px, Video production, Captions and Version History move into a More menu so the toolbar stays on one row.
  - Undo and Redo (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z) walk the versions, and Version History undoes any one of them. Unsaved typing survives a reload or a lost connection and is restored to the same document.
  - Comments are saved with the text they point at, across paragraphs and pages. The Comments panel lists them; each can be replied to, reacted to, resolved and reopened.
  - Presentation preview shows the slides of the saved version, with the arrow keys and `Esc` working at once; `Esc` first closes an open menu or dialog, then leaves the presentation.
  - Video production puts the page's picture, voiceover and captions on one timeline: the author edits each step's script, picks voices for the document, a page or a step, records their own voice, trims imported audio and decides whether the voice plays with the animation or after it.
  - The names follow Microsoft Word's, in Chinese and English, and every control works in light and dark, on the desktop and on a phone.
- `@lincyaw/dsh`:
  - The app bar holds the document's path and title, Approvals (only when an outside AI tool asks to do something, which the author allows or denies), the AI assistant, More and Settings.
  - Settings offer the language, appearance, text size, keyboard shortcuts and the model; the code working view, with the AI's working details and permissions, stays off unless the author turns it on. Help names only buttons that exist.
  - The AI assistant works on the open document; without a model it says so and leads the author to set one up.
- `@lincyaw/kernel`: the preview protocol carries the position, edits and shortcuts the editor and the preview share, and the semantic palette of document colours (`DOCUMENT_COLOR_NAMES`, `documentColorToken`, `documentColorValue`).
- `@lincyaw/workspace`: every save in a git workspace is a version. `history/undo` and `history/redo` walk a document's versions. An AI's turn is a version too, committed when it ends, or held for the author to accept or reject when `review: required` is set.
- `@lincyaw/design`: the icons, colour tokens and shared controls the workbench is built from, in light and dark.
