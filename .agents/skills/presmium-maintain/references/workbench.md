# The workbench and the dsh bundle

The workbench (`packages/workbench`, React) runs as a client plugin of DeepSeek Harness inside the bundle
`@lincyaw/dsh` (`packages/dsh`), launched by `packages/studio`. The design is `docs/design-dsh.md`; this file
keeps the rules to act on and what to verify when you change each part. Section numbers below are of
`docs/design-dsh.md` unless another file is named.

## Who it is for

The workbench serves teachers who are not technical (7.3). Keep the simple loop first: point at a problem on
the document, edit it directly or hand it to the AI, undo at any time. Professional code editing is the VS
Code extension's job.

- Keep authoring on the document: ordinary text is edited as blocks; generated content offers source and preview within the same block. Read the actual definition declared in the IR, or the block's MyST fragment when it has none. Do not turn the workbench into a project-wide IDE, file tree or raw problem panel, and keep git vocabulary out of the authoring flow.
- UI copy uses conventional product terminology: concise noun labels such as “讲解文本” and precise options such as “与动画同步” and “动画结束后”. Avoid conversational questions such as “这一刻要讲什么” in fields or controls.
- Command names follow Word: Undo, Redo, New Comment, Version History, Accept and Reject, Editing and
  Viewing. Both the zh-CN and the en text are complete.

## Workspaces, sessions and the current document

The mapping of workspace, session and current document is defined in 6.2: one dsh workspace (the
workspace root), sessions fixed to it, the current document passed by `POST /api/presmium/context`. When you
change how the agent writes, verify that code and other documents in the workspace go into the same review,
including documents that are not selected, and that after a failed commit the review can still be retried or
rejected (6.5).

## Editing on the document

Pages contain blocks and correspond to IR sections (one slide in Present). The page list's plus and the block menu's New page insert a distinct page after the current one; adding an ordinary block stays within its page. Flush body drafts before a page insertion, preserve existing source and narration, and focus the new page only once it is present in the IR. Verify insertion order, independent editing and presentation, and undo/redo; refuse ambiguous cross-file boundaries instead of guessing.

Source/preview is a view of one block, not a picker that replaces it with another animation. Preserve its block ID and step bindings. The workbench resolves the source from the current IR anchor, checks the opened version and edit lock, and saves through the existing source/history path. Show when multiple blocks share a definition file. Keep source drafts through view switches and preview reloads; on conflicts or failed saves retain the draft instead of overwriting a newer file. Verify the source/preview loop separately from page and step navigation.

Editing happens on the document page. The preview protocol's `pick` reports the position of a click or a
selection, and the workbench draws a toolbar beside the pointer; `edit` makes one block editable; `edited`
returns the text before and after; `packages/workbench/src/text-edit.ts` maps the difference back to the
source by the block's source lines in the IR, and refuses to write back across formatting marks, handing the
change to the AI instead (7.3 "就地编辑"). When you change this chain verify that edits in plain text, inside
emphasis and inside a link are written back correctly, that an edit across a link leaves the file unchanged,
and that Markdown characters are escaped.

## Undo, redo and versions

Every save is a commit. Undo and redo go through `history/undo` and `history/redo` with `expect`; version
history marks undone changes from the `reverts` and `revertedBy` of `revisions`. Verify undo, redo, a new
change clearing redo, and that an AI turn becomes one version when it ends.

## Preview binding

A preview connection is bound to the document and form it was opened with; navigating to another lecture
inside the preview follows the current document through `ready.document`. Verify that after switching the
selection enters the new document's chat context, and that closing the toolbar clears the focus.

The workbench has only two entries, Document and Present, sharing one web viewer and one iframe
(`docs/architecture.md` 1.1). The slides are what Present shows; with a lecture configured, Present prepares
the player, and it plays only after a click; video files come only from Export. Verify that after a normal
click time advances, pause works, the player unmounts on return to Document and the window identity is kept;
DOM visibility or a module cache hit is not enough. The player and the captions take their own space: in
light and dark, desktop and narrow, the slide fits completely in the remaining canvas. A cold start also
covers the handshake arriving before the viewer plugin registers.

## Diagnostics and agent feedback

Diagnostics are the workspace service's current snapshot (5.4); the workbench and MCP subscribe to the same
source.

- A new warning is verified for appearing, clearing on recovery and isolation between documents; reading the
  diagnostics resource does not run a full check.
- dsh injects the concrete diagnostics before a model step; a failed subscription is reported as
  unavailable; notifications do not start the model by themselves.
- The workbench only says "some content could not be shown correctly"; the raw text is under "Details".
  "Let AI fix it", AI rewrite and comments all go to the current session through
  `packages/dsh/src/client/agent-requests.ts` and keep the input draft.
- When judging the agent's environment feedback, tell apart `get_diagnostics` (source and checks),
  `get_outputs` (compiled recordings) and `get_runtime` (plugin and component failures, live execution and
  session resets that the author's browser actually reported). They are reported through the existing
  `STATUS`, bounded, with position and time. No window feedback does not mean success; after a change, run
  it again or confirm the page.

## What dsh tells the agent

The guide and document snapshot in `packages/dsh/src/node/context.ts` and the persona in
`packages/dsh/web.patch.yml` describe the system, they do not prescribe steps: where things are, what the
agent is responsible for, which tool tells what; complete facts; paths relative to the workspace root. The
author's messages and comments are the task; answers speak about what the author sees, not internal
implementation (6.4, 6.6). Conventions specific to one workspace (generated files, files that change
together) go into that workspace's `AGENTS.md`. To evaluate the agent, read the session trajectory: how many
steps, where it explored facts the context should have given, which instruction made it do more.

## Telemetry

Operator telemetry (6.7) is collected only when `PRESMIUM_TELEMETRY_URL` is set. The bundle row
`presmium-telemetry` exports every event of each session; the workbench's `OperationLog` records the
author's operations and hands them to the host through `/api/presmium/telemetry`.

- A new operation the author can perform is recorded in the matching `Workbench` method with `#record`
  (`#timed` for slow ones) in `packages/workbench/src/workbench.ts`.
- A request handed to the AI brings back the session and request IDs (`AgentAnswer`); correlation relies
  on them.
- Verify with the fake collector `packages/dsh/src/node/fake-collector.ts`, as in
  `packages/dsh/test/telemetry.test.ts` and the "the operator's collector" group of `e2e/workbench.spec.ts`.

## Layout

- New and History sit at the top of the chat column; History is Harness's session list. New uses the public
  `uiWorkspace.startSession` with the current workspace and keeps the current document; never simulate a
  click on the hidden sidebar button.
- The top app bar holds the logo and the path (documents, current document, global panels); on the right,
  AI assistant, More, Settings and Help. The chat history opens from the chat header.
- The document view looks like a word processor (7.3): command bar, navigation pane, the paper or the slide
  on a canvas, status bar. In the web form the preview shows only the paper (the page app's `PreviewSheet`,
  `packages/web/src/app/page-app.ts`); never bring the site's navigation back into the workbench.
- Selecting a session in the chat history shows the chat directly, also when reselecting the current session;
  do not rely only on watching the session ID change. `ctx.layout.selectPanel(null)` brings up the session as
  the Harness contract says; links in the chat to a document's Markdown go through
  `LayoutController.showDocument()` to that place in the document. Verify separately that a background
  start binding does not steal the view, that a link does not expand the chat, and that the chat history
  restores the chat and the draft.
- One shell only when reusing content components: Harness's `ui-layout` and `ui-sidebar` rows are off by
  default and Presmium composes the session browser, settings and chat header through public slots; the
  fallback mode turns both back on (7.2). Check for duplicated branding, action bars and entries, and after
  dragging, narrowing and full screen verify the panels' real bounds and click areas, not only that elements
  exist.
- Plugins and automation are global tools, collected through `sidebar.panellist` in the app bar's More menu.
  There is one workspace: the chat history shows no workspace row, and the chat offers no workspace or agent
  preset picker (hidden by slot name and row key, never by generated class names). The chat header keeps no
  native right-sidebar toggle (removed through the `conversation.session.header.corner` slot), while reviews
  and media previews still open by content. Verify an empty session, one with messages and the state after
  clicking a file, so collapsed panels do not bring back extra entries.

## Upgrading dsh

dsh is pinned to one exact version; an upgrade is its own change and must pass the five upgrade-gate groups
(section 12; Vitest cases named `[gate]`, Playwright cases tagged `@gate`). The client-side contracts that
only a README describes are guarded by gate group 3 (`docs/architecture.md` 9.1).
