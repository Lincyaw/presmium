# The workbench and the dsh bundle

The workbench (`packages/workbench`, React) runs as a client plugin of DeepSeek Harness inside the bundle
`@lincyaw/dsh` (`packages/dsh`), launched by `packages/studio`. The design is `docs/studio.md` (targets,
not verified behavior), author actions over Web and MCP are `docs/authoring-actions.md`, controls and
styles are `docs/design-system.md`. Section numbers below are of `docs/studio.md` unless another file is
named. "Verify" means a real run in `pnpm studio` or an isolated copy with `pnpm debug:studio`
([debugging](debugging.md)).

dsh is configured as a tree of **rows** (one plugin each, with configuration and an enabled flag, ID such as
`ui-layout`). Presmium's changes are `packages/dsh/cordis.patch.yml` (host) and
`packages/dsh/web.patch.yml` (web client).

## Event transport

Studio defaults its workspace service and HTTP MCP to fixed port 4321. External MCP credentials are persisted per canonical launch directory under the Studio state home, independently of installation profiles; internal service and session tokens remain separate. An occupied port fails with `--preview-port` guidance; only an explicit zero requests a temporary port. Check real HTTP calls before and after a restart with the same URL and credential when changing this lifecycle (`docs/studio.md`, sections 5.2, 9 and 11).

Studio sets `client-hmr.disabled: true` in its web patch. Source, diagnostics, reviews, IR and jobs update
through the authenticated Presmium event WebSocket; a client rebuild leaves the page running. Do not
re-enable root HMR: a full reload loses session-only comment drafts. Do not patch the loader, keep a second
draft store or add retries or fixed delays against connection starvation. `WorkspaceClient` keeps its
subscription injection optional so standalone callers still use EventSource.

## Agent tool catalogs

Document client discovery omits transport bindings by default; request `details: true` for protocol diagnosis.
Compact browser request polling returns the same projected receipt as an immediate editor action.
Use `details: true` on the status query for the original receipt; full compatibility connections keep it.
External MCP and the Harness model surface share `@lincyaw/mcp/client`'s compact catalog,
argument summaries and resolver. `DocumentBinding.tools` keeps full trusted metadata off the model;
`registeredTools` pins what was installed until the next step boundary or the agent is idle. Resolve the real target before policy,
review hooks and dispatch: its kind/approval govern confirmation, workspace governs candidate/author
routing, and its schema validates the nested arguments. Never rewrite frozen Harness execution args.
Refuse a changed target definition or document binding. Tool-list refresh must release old registrations;
images and structured failures still use the original call result. Candidate services inherit the Studio launcher’s exact Presmium command, including its bundled renderers and plugins; do not fall back to the bare CLI from a different installation. Verify in the real Harness with a
scripted local provider, including schema rejection, candidate publication, owner-state reads and approval.

Variant discovery is also shared: derive discriminators and selected argument summaries from the original
schema, including nested object parameters. Keep shared fields, required constraints and reachable root
definitions. Refuse ambiguous values and projections that would break position/anchor/resource references;
the complete schema stays readable. Discovery never narrows the schema used for execution. Verify both
the external MCP and real Harness carrier, with plugin root unions and reference boundaries.

## Who it is for

The workbench serves teachers who are not technical (section 1): point at a problem, edit it or hand it to
the AI, undo any time.

- Web authoring shows content, public parameters, material previews, chat and comments. No implementation
  source, IR, file tree or raw stacks. `dist/ir.json` is a snapshot and never edited as content.
- Copy follows `docs/glossary.md`; script, voiceover, captions and transcription are distinct. Captions are
  not a second editable body. zh-CN and en are complete, including tooltips and accessible names.
- Toolbars are icon-first through `PmIconButton` and the semantic names in `packages/design/src/icons.ts`;
  every icon action has a localized accessible name and a discoverable label.

## Component parameters

Use the controlled `PmSchemaForm` (`packages/workbench/src/schema-form`). The draft stays with the caller
and is bound to its target; only a valid draft is applied through the existing source owner. CFworker is the
only validator; RJSF packages stay pinned together and are used through public entries only. Read-only and
public paths come from `documentParameterAccess`; it is not a transaction guard, so the action owner still
checks changed leaves and schemas before the final `validateDocument`. Keep unknown values and branch state;
never synthesize values or reveal undeclared `additionalProperties` names.

## Editing the document

Three entry points share `lecture.json`: document editing, presentation and video production (sections 16
to 19). The document editor is one full-document BlockNote instance with its native selection, history and
comments; do not add per-page editors or a second selection or comment toolbar. Present and Video read
independent snapshots and never take focus or mode while editing.

- Read `docs/ir.md` and `TeachingDocument` before changing transactions. Web and agent changes go through
  the same transaction boundary with `baseDocumentVersion`. Saving does not wait for compilation; a failed
  compile keeps the last good snapshot and names its source version.
- Workspace MCP authoring (`get_authoring_capabilities`, `get_document_outline`, `read_document_part`,
  `plan_document_change`, `apply_document_change`, page, history, comment, audio and voice tools) uses the
  same owners as HTTP: one `DocumentEditor`, one `DocumentHistory`, `DocumentOperations`,
  `createDocumentAudioAuthoring`, `createDocumentVoiceAuthoring`. Never add a second writer, replay ledger,
  compile step or tool adapter with its own queue. Unimplemented actions are not advertised. Tools, budgets
  and receipts: `docs/authoring-actions.md` sections 2 to 10.
- Narration block removal and ordered step references reuse the native `replaceStepNarrations` pure rule through `removeNarration` and `setStepNarrations`. The latter takes the complete ordered list, removing omitted links while preserving shared content. Keep `get_context` text and stable IDs aligned and bounded; quick `edit_narration` removal uses the same transaction owner.
- `rename_page` and `edit_document` compose the existing read/plan/check/apply owner in one MCP call. Keep the operation schema derived from the kernel schema and CLI introspection derived from live tools/list. The owner's credential authorizes canonical editing only; execution, paid tools and browser control retain their policy. Return actual saved-source readback and bounded client-reported editor/preview state separately. Do not add automatic compilation or turn pending editor feedback into a failed save or another write. Simple edits use their receipt; checks and captures follow the task scope.
- Ordinary audio/image imports and recording adoption reuse native request schemas and owners. Pin source
  and actual file/asset hashes before approval, never repin after a conflict. External MCP and trusted dsh
  share stateless preparation; dsh performs it before its own pre-execute approval and associates the fixed
  payload with token, binding, original immutable arguments and definition in a bounded per-binding map. Never rewrite frozen exec arguments or
  prepare a missing payload after approval. Consume once and clean up on the final result, including denial.
  Keep default receipts compact and explicit native request mode compatible; derive alternative input
  requirements from schema rather than maintaining another parameter table. Verify both actual MCP approval
  and Harness ask, including file/source changes during the decision and native receipt replay.
- Browser-only MCP actions (`preview.prepare`, `source.flush`, body, comment and component-property drafts)
  go over the shared workspace WebSocket to the `AuthoringClients` owner and need exact client
  epoch and input revision. Source-changing actions also pin the canonical source. Admission is not completion; only the browser acknowledges. No MCP ACK tool,
  per-tab SSE, automatic compile or mode switch, or replay after disconnect. Passive state never contains
  draft content. See `docs/authoring-actions.md` section 11.
- Root window navigation reuses `editor_action` and the existing authenticated WebSocket, with a
  separate `AuthoringWindows` lifetime from document leases. Home is not the root document `""`.
  Pin target UUID before approval and recheck before native adoption and done ACK; keep old document
  ACK scope strict. Only an unbound, unconfirmed external owner can navigate. Keep transport fields
  internal: compact pending handles resolve uniquely among the member's retained requests, never replay.
  Native document slots retain body saves; the production owner retains recording range drafts by identity.
  Composition, pending forms and asset writes block navigation; cancellation/human input retire pending
  loads without overwriting a later human view. Verify real home/open/close, root directory, approval,
  cancellation, multiple windows, disconnect and preservation of input during slow saves.
- Body recovery uses `DocumentSession` and its native backup store through `editor_action`, with bounded
  metadata and explicit fragment reads. Local inspection/recovery/retirement stays available when the saved
  source observation is stale; only a real native read can restore saved content. Retry is a canonical write:
  pin the source internally before approval, reject a superseded refresh, check the actor base again before
  CAS, and never rebase/retry the same MCP request against a newer source. Preserve human input during a
  slow save and keep recovery gates on failure. Cancellation aborts pending guarded storage mutations;
  author backups queued independently still finish. Required review refuses retry. Verify actual browser
  recovery, fragment paging, blocked storage cancellation, refresh/save conflicts and continuing input.
- Comments use native rich-text ranges with stable unit IDs and offsets; cross-block selection uses the
  editor's public APIs, not DOM `selectionchange`. The editor's Y.Doc is not storage. Web and MCP share the
  pure comment actions; owner and editor permissions apply in both. Reply and edit drafts are backed up by
  the workbench, bound to the thread, member and target; recovery is explicit, never auto-submitted.
- Page create, rename, move, delete and duplicate work on stable section IDs through kernel page rules
  (`plan_page_change`, `apply_page_change`, `duplicateDocumentPage`). Deletion needs explicit
  confirmation and refuses dangling bindings; the last page keeps its title and one empty step.
- Generated content changes only through parameters, definition scope, chat or comments. Unknown plugin data
  stays intact with a readable diagnostic.

Verify full final-page content, Enter, lists and formatting, comments, step jumps in preview, Undo right
after typing, save failure and recovery, document switching, in light and dark, desktop and narrow.

## Undo, redo and versions

Every save is a commit. Undo and redo use the routes `history/undo` and `history/redo`
(`packages/workspace/src/node/routes.ts`); `expect` names the commit the client believes comes next and a
mismatch answers 409. Undone changes are marked from `reverts` and `revertedBy`
(`packages/workspace/src/node/revisions.ts`). External projections and saved acknowledgements are
baselines, not undoable edits. Verify undo, redo, a new change clearing redo, and each completed AI writing tool
getting its own version.

AI file and source-writing tools edit a private candidate workspace. Publish all changed files with their original
versions in one short transaction; stale input returns to the AI for a fresh read and retry. The author's editor
stays available during AI work and required review. Reject and checkpoint restoration touch only candidates;
history and browser control still use the original service.

## Drafts and positions

Section 20 defines positions, drafts and status. Drafts are bound to workspace, document and version; a late
acknowledgement or result after switching documents never clears newer input or lands in another document.
Body and caption backups use `DocumentDrafts` (`packages/workbench/src/document-drafts.ts`) with strict
IndexedDB transactions; only the latest completed transaction clears pending state, and recovery commits a
new backup before replacing input and never writes the source by itself. An interrupted IME composition
stays a draft until Save, more editing or Discard. Return points own page, step and scroll; a programmatic
return scroll is not author reading.

## Presentation and video

- No separate workbench toolbar in Present. The viewer bar requests recompile and exit through the
  `presentation-action` preview report, accepted only from the active frame.
- Playback shares one row with viewer navigation: Play/Pause, Captions, a range with time, and a More menu
  (speed, caption language, caption list, chapters). Interaction pauses; Play resumes from the current
  position. Captions use the shared host overlay inside the slide and never resize it.
- One active media clock. Opening, switching steps or compiling never synthesizes voiceover; the script route
  reads only exact cache matches through `SpeechService.lookup`. Editing the current step invalidates its
  audio and pauses there. Selecting a voice never starts synthesis.
- Voice, pronunciation, hold and pause belong to video production; the document caption sidebar shows only
  captions and narration start.
- The caption editor and timing controls have distinct sibling keys bound to the source and step.
  Switching steps leaves one caption editor in the sidebar and releases the previous step's editor.

Verify time advancing after Play, pause and seek, first/last and reverse jumps, the return position after
Present, the same iframe `window`, a changed sentence with current captions and a silent placeholder, and
the slide fitting the canvas without captions covering the body (light/dark, desktop/narrow, text and mixed
pages, cold start with the handshake before the viewer plugin registers).

## Preview binding

A preview connection is bound to its document and form; navigating inside the preview makes the new
document current through the `document` field of the protocol's `ready` message (section 4). All views use
the same web viewer and iframe (`docs/architecture.md` 1.1). Canonical step IDs are authoritative; runtime
numeric steps are projections. Verify the selection enters the new document's chat context and Escape
clears the toolbar and focus.

## Diagnostics and agent feedback

Diagnostics are the workspace service's current snapshot (section 5.3); the workbench and MCP read the same
source. Authoring-window errors go to `diagnostics/authoring` without waiting for an IR.

- Build and export first flush the active document and bind its acknowledged source version; the job
  records that separately from the IR revision. Verify the output file's text, not only the job status.
- A new warning appears, clears on recovery and stays within its document.
- The workbench shows a plain message with raw text under "Details". "Let AI fix it" and comments go to the
  current session through `packages/dsh/src/client/agent-requests.ts` and keep the input draft.
- Agent tools differ: `get_diagnostics` (reported snapshot), `check_document` (explicit compile and checks),
  `get_outputs` (build results), `get_runtime` (what browsers reported through the host `STATUS` service);
  in dsh they are prefixed `presmium__`. No browser feedback does not mean success.

## What dsh tells the agent

The guide and snapshot in `packages/dsh/src/node/context.ts` and the persona in `packages/dsh/web.patch.yml`
describe the system, not steps: where things are, what the agent owns, which tool tells what, paths relative
to the workspace root (sections 6.4, 6.6). Workspace-specific conventions go into that workspace's
`AGENTS.md`. Evaluate the agent from the session trajectory: step count, facts it had to explore, which
instruction made it do more. Review rules are section 6.5: changes to code and unselected documents join the
same review, and a failed commit can still be retried or rejected.

## Telemetry

Collected only when `PRESMIUM_TELEMETRY_URL` is set (section 6.7). The row `presmium-telemetry` in
`cordis.patch.yml` exports session events; `OperationLog` sends author operations to
`/api/presmium/telemetry`. Record a new author operation in its `Workbench` method with `#record`
(`#timed` for slow ones) in `packages/workbench/src/workbench.ts`; AI requests return session and request
IDs (`AgentAnswer`). Verify against `packages/dsh/src/node/fake-collector.ts`.

## Layout

- The top bar holds the logo and the path; on the right, AI assistant, More, Settings and Help. New and
  History sit at the top of the chat column; New uses `uiWorkspace.startSession`, never a simulated click.
- Content shows the page list and body; Sequence the final-frame preview, page timeline and step properties;
  Present a clean canvas. The web preview shows only the paper (`PreviewSheet` in
  `packages/web/src/app/page-app.ts`), never the site navigation.
- One shell: the `ui-layout` and `ui-sidebar` rows are off and Presmium composes through public slots. The
  fallback (section 7.1, `packages/dsh/src/client/fallback.tsx`) turns them back on when the root layout
  fails. Hide framework entries by slot name or row key, never by generated class names.
- Selecting a session shows the chat, also when reselecting the current one; `ctx.layout.selectPanel(null)`
  brings it up. Document links go through `LayoutController.showDocument()`.

Verify after dragging, narrowing and full screen the panels' real bounds and click areas, an empty session,
one with messages and the state after clicking a file, with no duplicated branding or entries.

## Upgrading dsh

dsh is pinned to one exact version; an upgrade is its own change and must pass the upgrade gate (section 12;
Vitest cases named `[gate]`, Playwright cases tagged `@gate`). The gate is a test set, so confirm with the
owner before running it. Client contracts only a README describes are listed in `docs/architecture.md` 9.1.

## Production docks and voice service

Production uses left Pages/Assets, the central monitor with one step strip and transport, right
Script/Voiceover/Captions tabs, and a full-width timeline. Public PmSplitGroup/PmSplitPanel/PmSplitHandle
provide the three adjustable boundaries. Export is a dialog; tab changes retain editor identity and drafts.
Embedded playback hides its own viewer bar through externalControls while keeping it mounted.
PmTimeline uses variant=editor and showSteps=false. Layout never writes canonical Production timing.

Settings → Voice Service is a public settings.section contribution, also opened from DocumentVoiceField.
Reuse SpeechSettingsPanel and the workspace speech-settings owner route with its launcher-token gate.
Store the API key only in the operator directory (0600 file, lock and revision comparison); return status
only. Saving refreshes catalogues and plans without restarting; checking local configuration never
authenticates or synthesizes. Preview and generation retain explicit provider confirmation.

Production Play is one cancellable on-demand voice intent. The existing LecturePlayer buffers at an
unsaid utterance before its estimated interval; the UI starts the shared source-bound voiceover job,
reuses exact cache entries, loads the new plan/track in the mounted frame, and resumes at that cached
utterance identity. Do not replace the iframe per clip or add a second media clock. Explicit navigation,
other audio starts and source/project changes retire pending intent; rate changes preserve it.
Estimated plans never admit arbitrary time seeks or export. Provider errors map through speechFailureCode
to localized reasons; never display upstream payloads or credentials.

The workbench shares its state through `workbench-state.ts`. `DocumentEditing` owns editor focus, selection, page operations and viewport restoration; `DocumentProduction` owns source-bound media, timing drafts and narration edits. Panels use `workbench.editing` and `workbench.production`; their document lifetime ends through `reset`, with durable resources closed on `dispose`.

Production draft MCP actions share `DocumentProduction`'s existing numeric, caption, recording-range,
voice and media banks. `production-draft-actions.ts` provides metadata-only discovery, exact-handle fragments and explicit
discard through `editor_action`; it does not own another store or submit source changes. Mounted native
views register composition/save guards and clear their visible input only after a successful discard.
Tab storage must compare the captured raw value and persist removal before clearing memory; unreadable
or externally changed slots report partial coverage. Local reads tolerate invalid canonical JSON;
discard retains strict source, input-revision, permission and pending-write checks. See
`docs/authoring-actions.md` section 11 for the public contract.
Voice/media writes publish draft revisions through the production owner; their banks remain the only
content stores. Retiring one clip preserves sibling entries and refreshes the mounted form from that bank.
Report interaction changes only when the native state changes; empty preview cleanup must not invalidate
a successful mutation acknowledgement. Studio supplies existing approvals through the shared dialog
actions slot so modal and nested confirmations retain their focus boundary while accepting MCP requests.

Comment draft actions use the same `CommentDrafts` registry and strict backup transactions as the UI.
Mounted native composers own active discard; recovery controllers reopen new text/place forms and wait
for actual native adoption. Direct mounted targets take precedence over controllers. Registration stays
stable across ordinary input; readiness and captured read-only state follow their native lifetimes.
Restore can derive the unique composer and preserved branch internally; explicit legacy bindings remain
paired. Keep original candidates and current input backed up, carry cancellation/source/input guards into
IndexedDB create/mark, and recheck a writer's identity synchronously after every awaited hash before
removing it. Approval interactions keep these non-modal forms open through the shared popover boundary;
they never loosen the request's input or source checks.

Comment mutation preflight may reread the same exact reference up to four times while native owners and
record pointers are unchanged, so an outstanding durability acknowledgement does not force a new model
call. Capture those pointers before any await; actual input, ownership, source or cancellation changes
refuse instead of retrying. The retry boundary ends before recover/mark/create. Metadata pagination
still validates its observation token, and retired candidates are checked through their exact marker.
