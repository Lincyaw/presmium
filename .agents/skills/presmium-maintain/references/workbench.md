# The workbench and the dsh bundle

The workbench (`packages/workbench`, React) runs as a client plugin of DeepSeek Harness inside the bundle
`@lincyaw/dsh` (`packages/dsh`), launched by `packages/studio`. The integration design is
`docs/design-dsh.md`; the single UI/UX decision source is `docs/rfc-workbench-uiux.md`, and the formal
control/style/asset implementation spec is `docs/design-system.md`. The RFC supersedes
the older interface design and describes targets to implement, not capabilities already verified in the
running service. This file keeps the implementation boundaries and checks. Section numbers below are of
`docs/design-dsh.md` unless another file is named.
"Verify" here means a real run in the studio (`pnpm studio`, or an isolated copy with
`pnpm debug:studio`, see [debugging](debugging.md)); tests named below are examples of how to set
something up, run only when the owner asks.

dsh is configured as a tree of **rows**: each row is one dsh plugin with its configuration and whether it is
enabled, identified by an ID such as `ui-layout` (terms table at the top of `docs/design-dsh.md`). Presmium's
changes to the tree are `packages/dsh/cordis.patch.yml` (host side) and `packages/dsh/web.patch.yml` (web
client).

## Who it is for

The workbench serves teachers who are not technical (7.3). Keep the simple loop first: point at a problem on
the document, edit it directly or hand it to the AI, undo at any time. Technical users edit project files
in VS Code's native editor; the extension provides preview, diagnostic navigation and export.

- Keep target Web authoring on content, public parameters, material previews, chat and comments. Do not
  expose implementation source, IR, a file tree or raw stacks as the ordinary author's workflow. Tauri
  reuses this Web workflow; code and raw IR belong to the technical project entry. The normalized `lecture.json` is the sole editable authority; generated `dist/ir.json` is a runtime snapshot and must never be edited as content.
- UI copy follows the RFC terminology table: authored script, voiceover, captions and transcription have
  distinct meanings and save targets. Do not restore conversational player labels or use captions as a
  second editable body. Keep complete zh-CN and en messages, including tooltips and accessible names.
- Use icon-first toolbars on desktop as well as narrow screens, through the design system's semantic
  Lucide mappings and `PmIconButton`. Preserve concise text for page identities, fields, meaningful options,
  errors and confirmations. Every icon action needs a localized accessible name and a discoverable label;
  the RFC section 3.2 is the authoritative action/icon mapping.
- Implement public controls from `docs/design-system.md` before business layout. Do not restyle a public
  button or input through business CSS, inline styles or page-specific descendants. Missing tokens,
  states and behavior go into the shared layer and the corresponding Figma variant first. When touching
  legacy styles, migrate that scope rather than adding overrides. Low-fidelity prototype controls are not
  approved visual specifications.

## Workspaces, sessions and the current document

The mapping of workspace, session and current document is defined in 6.2: one dsh workspace (the
workspace root), sessions fixed to it, the current document passed by `POST /api/presmium/context`. When you
change how the agent writes, verify that code and other documents in the workspace go into the same review,
including documents that are not selected, and that after a failed commit the review can still be retried or
rejected (6.5). A **review** is the set of changes an AI turn made, which the author accepts (then they are
committed to the workspace's git repository) or rejects.

## Editing on the document

The workbench has three separate entry points: native document editing, compiled presentation and video production. All share the normalized `lecture.json` authority. The document editor is one full-document BlockNote instance with native selection, formatting, history and CommentsExtension; do not retain per-page editing hosts or a second DOM selection/comment toolbar. Present/Video consume independent snapshots and cannot steal focus or mode while editing.

Read `docs/rfc-document-ir.md` and the exact `TeachingDocument` contract before changing transactions. JSON Schema, IDs, references, tree ownership, component parameters/states and media ranges are validated through `validateDocument`. Agent and Web changes use the same document transaction boundary and `baseDocumentVersion`. Saving valid document content does not wait for compilation. Snapshot compilation failure retains the last successful snapshot and identifies its source version.

Page creation, renaming, moving and deletion operate on stable section IDs/order and explicit block ownership; no Markdown headings, source ranges, parsed fingerprints or syntax-preserving writer are authoring contracts. Preserve referenced steps/narrations and reject deletion that would leave dangling bindings. Code and assets remain project references.

Keep native history responsive, including toolbar Undo immediately after typing. External projections and saved acknowledgements are baselines, not new undoable edits. Draft recovery is bound to workspace/document identity and version. A late acknowledgement, generation result or response after switching documents cannot clear newer input or be adopted by another document.

Comments use native rich-text ranges with stable editing-unit IDs, offsets and document version. Cross-block selection must use the editor's public APIs; do not rebuild range ownership from independent DOM selectionchange handlers. Persist only Presmium document data through the source transaction boundary; an editor's internal Y.Doc is not a second storage format or a multiplayer system.

Generated content is changed through explicit parameters, definition scope, chat or comments. Unknown versioned plugin data remains intact with readable capability diagnostics. Real authoring checks cover complete final-page content, ordinary Enter/list/formatting behavior, comments, arbitrary step jumps in preview, immediate Undo, save failure/recovery, document switching and actual light/dark desktop/narrow combinations.

## Undo, redo and versions

Every save is a commit. Undo and redo go through the workspace service's routes `history/undo` and
`history/redo` (`packages/workspace/src/node/routes.ts`); the body's `expect` names the commit the client
believes comes next, and a mismatch answers 409 so the client reads the history again. Version history marks
undone changes from the `reverts` and `revertedBy` fields of each revision in the history (`packages/workspace/src/node/revisions.ts`). Verify undo, redo, a new
change clearing redo, and that an AI turn becomes one version when it ends.

## Preview binding

A preview connection is bound to the document and form it was opened with; navigating to another
document inside the preview makes it current through the `document` field of the preview protocol's
`ready` message. Verify that the selection enters the new document's chat context, and that Escape
dismisses the toolbar and clears the focus.

The RFC defines Content and Sequence as authoring workspaces, with Present and Export as actions. Keep
them on the same web viewer and iframe (`docs/architecture.md` 1.1); runtime view IDs do not define extra
workspace tabs. Use the RFC section 6 selection/draft table when changing navigation: an old draft stays
bound to its old source while the inspector immediately follows the new selection, and save callbacks keep
their original target and version. The IR has no stable Step ID; convert full-document and media-filtered
steps through the existing trail/map instead of treating array indexes as identity.

Step-script drafts are keyed by document, section and step in `narration-drafts.ts`, with a workspace-scoped
browser recovery record and a source baseline. Saving is serialized with body edits, waits for a newer IR
revision, and confirms only its submitted edit version. Follow RFC section 6 for debounce and composition
behavior. Verify switching steps during a pending save, typing before its acknowledgement, closing the
panel before completion and recovering a draft after reload; a changed step structure must be rejected.
An interrupted composition remains a draft requiring review, including after reload; it must not leave a
stuck composition flag or be autosaved as if the input method had finished. Explicit Save, further editing
or Discard resolves that interruption.

Verify actual time advancing after Play, pause and seeking, direct first/last and reverse step jumps, and
the return position after Present, and that the iframe keeps the same `window` object. There must be only one active media clock. Opening, switching steps or
compiling must not silently synthesize voiceover. The script GET route now uses the optional public
`SpeechService.lookup` contract to read only exact request matches from cache; alignment reads use
`transcribe: false`. Verify a changed sentence has current captions and a silent placeholder, while unchanged
sentences keep valid cached clips; an absent lookup capability must never fall back to synthesis. Editing the
current step invalidates its old audio and pauses at that step, while unrelated updates preserve valid
position. Audience views contain no author editor; video comes from Export using the same lecture plan.

In light and dark, desktop and narrow, the slide fits completely in the remaining canvas and captions and
controls do not cover the body. Include pure text and mixed pages. A cold start also covers the handshake
arriving before the viewer plugin registers. DOM visibility or a module cache hit is not enough.

## Diagnostics and agent feedback

Diagnostics are the workspace service's current snapshot (5.4); the workbench and MCP subscribe to the same
source.

- A new warning is verified for appearing, clearing on recovery and isolation between documents; reading the
  diagnostics resource does not run a full check.
- dsh injects the concrete diagnostics before a model step; a failed subscription is reported as
  unavailable; notifications do not start the model by themselves.
- The workbench only says "some content could not be shown correctly"; the raw text is under "Details".
  "Let AI fix it" and comments go to the current session through
  `packages/dsh/src/client/agent-requests.ts` and keep the input draft. Chat requests retain the selected focus.
- When judging the agent's environment feedback, tell apart the tools `get_diagnostics` (source and checks),
  `get_outputs` (compiled recordings) and `get_runtime` (plugin and component failures, live execution and
  session resets that the author's browser actually reported); in dsh they carry the prefix `presmium__`
  (`presmium__get_runtime`). The browser reports through the existing `STATUS` service of `@lincyaw/host`
  (`presmium.status`, `packages/host/src/contracts.ts`), bounded, with position and time. No window feedback does not mean success; after a change, run
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
`presmium-telemetry` (in `cordis.patch.yml`) exports every event of each session; the workbench's `OperationLog` records the
author's operations and hands them to the host through `/api/presmium/telemetry`.

- A new operation the author can perform is recorded in the matching `Workbench` method with `#record`
  (`#timed` for slow ones) in `packages/workbench/src/workbench.ts`.
- A request handed to the AI brings back the session and request IDs (`AgentAnswer`); correlation relies
  on them.
- Verify against the fake collector `packages/dsh/src/node/fake-collector.ts` (point
  `PRESMIUM_TELEMETRY_URL` at it); `packages/dsh/test/telemetry.test.ts` and the "the operator's collector"
  group of `e2e/workbench.spec.ts` show how to wire it.

## Layout

- New and History sit at the top of the chat column; History is Harness's session list. New uses the public
  `uiWorkspace.startSession` with the current workspace and keeps the current document; never simulate a
  click on the hidden sidebar button.
- The top app bar holds the logo and the path (documents, current document, global panels); on the right,
  AI assistant, More, Settings and Help. The chat history opens from the chat header.
- Follow the RFC layout: page list and body blocks in Content; final-frame preview, page timeline and
  selected-step properties in Sequence; clean audience canvas in Present. Assistant and other auxiliary
  tools open on demand. In the web form the preview shows only the paper (the page app's `PreviewSheet`,
  `packages/web/src/app/page-app.ts`); never bring the site's navigation back into the workbench.
- Selecting a session in the chat history shows the chat directly, also when reselecting the current session;
  do not rely only on watching the session ID change. `ctx.layout.selectPanel(null)` brings up the session as
  the Harness contract says; links in the chat to a document's Markdown go through
  `LayoutController.showDocument()` to that place in the document. Verify separately that a background
  start binding does not steal the view, that a link does not expand the chat, and that the chat history
  restores the chat and the draft.
- One shell only when reusing content components: Harness's `ui-layout` and `ui-sidebar` rows are off by
  default and Presmium composes the session browser, settings and chat header through public slots. The
  fallback (7.2, `packages/dsh/src/client/fallback.tsx`) turns both rows back on: dsh's own layout with
  Presmium's panels as right-dock tabs and global panels, for when the root layout plugin fails. Check for duplicated branding, action bars and entries, and after
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
(section 12; Vitest cases named `[gate]`, Playwright cases tagged `@gate`). The gate is a set of test cases; under the owner's rule (SKILL.md, Verify)
confirm with the owner before running it. The client-side contracts that
only a README describes are guarded by gate group 3 (`docs/architecture.md` 9.1).
