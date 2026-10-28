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

## Studio event transport

Normal Studio fixes `client-hmr.disabled: true` in its Web patch, which the official launcher applies after the profile. Its static boot manifest still loads the shell; source, diagnostics, review, IR and jobs update through the authenticated Presmium event WebSocket. A real client rebuild leaves the editing page running. Save or retrieve unconfirmed material before manually reloading. A later private patch can enable DSH's HMR mechanism, but Presmium root HMR is not supported with unconfirmed comment drafts: a real rebuilt frame plus new code execution caused an automatic full reload to lose session-only material after the old bank and leave protection were closed. Do not treat the return-point checkpoint as draft persistence. The public framework has no documented pre-unload veto or owner handoff; do not retain an invalid context/root, add parallel draft storage or patch the loader to claim support. See `docs/benchmarks/comment-draft-root-hmr-2026-10-28.md` and `docs/design-dsh.md` 2.3.

Keep the framework-independent `WorkspaceClient` subscription injection optional: standalone callers retain EventSource. Do not introduce an actor retry or fixed delay to work around browser connection starvation. The real six-tab before/after record is `docs/benchmarks/studio-multitab-transport-2026-10-27.md`.

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

Use the controlled `PmSchemaForm` for public component parameters. Keep every change, including an invalid numeric string, in the caller's current target-bound draft; apply only a valid draft through the existing source owner. Reset its React identity when the target or adopted source changes. The form owns neither persistence nor scope. Keep unknown values, render only declared schema fields, and use `hideProperties` only as a display mask. Definition and state schemas retain separate reference roots and cross-validate the same effective value through `extraValidation`. CFworker is the sole validity implementation. RJSF core/utils and the root entry's validator-ajv8 helper dependency are pinned together to 6.11.0 through ordinary dependencies and public roots. Never pass the AJV helper to Form or use it as another authoring validator; the measured production consumer tree-shakes its output completely. Do not use internal imports, aliases or vendor patches. See [the staged browser evidence](../../../../docs/benchmarks/component-schema-form-2026-10-28.md).

Semantic parameter actions use `documentParameterAccess` to distinguish schema-declared paths, read-only ancestors and unavailable resolution. JSON Schema validity alone does not enforce `readOnly`. The accessor uses json-schema-library 11.6.16's public local draft-2020-12 `getNode`/`reduceNode`; it removes only `readOnly:false` in schema positions of its private copy, so an applicable true annotation cannot be canceled by merge order. It never rewrites author JSON, references or branches, and leaves data annotations in default/const/enum untouched. Unknown fields stay preserved, and failed/ambiguous resolution is unavailable. Access is not a general validator, transaction or complete change guard: the action owner must check actual before/after changed leaves, applicable base/state schemas and whole-array operations before the final canonical validation.

Select's Choose placeholder uses RJSF's public `enumOptionsValueForIndex` and `options.emptyValue`, never `Number('')`; clearing an optional parameter removes its JSON key, while required validation remains active. Keep real false/0 and empty-string enum values distinct from the placeholder. A clean external source transaction must finish its Saving status after the acknowledged saving→clean transition, even when it started without dirty input; errors or later dirty input must not be reported as Saved. See [the real enum/save journey](../../../../docs/benchmarks/schema-enum-clear-2026-10-28.md).

`PmSchemaForm.accessorSchemas` accepts independent additional schema roots for field access: public from any root, read-only from any applicable root, and unresolved additional roots retain values as read-only. Continue validating each root separately through `extraValidation`. RJSF uses `documentParameterSchemaForAccess` only as its annotation view. A canonical accessor result with `reason: value-unresolved` remains unavailable to backend actions; only the public RJSF SchemaField's explicit selected branch can keep an incomplete UI draft editable while the original CFworker validator remains available. Missing schema/refs never use that exception. Keep native union state: only the verified unique required primitive const/discriminator path is editable; unsupported branches are read-only from first open, with their original selector/data retained and independent outer fields editable. Do not synthesize values, cache an authoritative last-good shape or rewrite branch state. Public AnyOf/OneOf wrappers and ObjectFieldTemplate omit duplicate contents only at the same native fieldPathId; nested objects and array items remain separate. Filter RJSF's documented ADDITIONAL_PROPERTY_FLAG from display, public property metadata and branch-preservation logic, so explicitly broad additionalProperties never disclose inferred private names or delete their data.

## Workspaces, sessions and the current document

The root shell retains the open document address per browser tab, including while a reload recovery is pending. Page, stable step and reading offset remain owned by Workbench's existing return points; do not duplicate drafts or resume Present/Video automatically. Recovery checks the actual workspace and the expected stable document identity before the source actor adopts the opening response. Explicit Home or a later selection wins; an old history completion must not reapply its checkpoint. Pass an optional HMR fallback into the existing opening controller, with saved browser positions taking precedence. A programmatic return scroll is not author reading: consume only its matching viewport destination once, while real gestures still retire the restore owner. See `docs/benchmarks/authoring-reliability-integration-2026-10-28.md` for the short-document counterexample and real wheel evidence. See `docs/benchmarks/document-browser-reload-2026-10-28.md` and the final repeated-reload scope in `docs/benchmarks/document-pending-reload-2026-10-28.md`.

The mapping of workspace, session and current document is defined in 6.2: one dsh workspace (the
workspace root), sessions fixed to it, the current document passed by `POST /api/presmium/context`. When you
change how the agent writes, verify that code and other documents in the workspace go into the same review,
including documents that are not selected, and that after a failed commit the review can still be retried or
rejected (6.5). A **review** is the set of changes an AI turn made, which the author accepts (then they are
committed to the workspace's git repository) or rejects.

## Editing on the document

The workbench has three separate entry points: native document editing, compiled presentation and video production. All share the normalized `lecture.json` authority. The document editor is one full-document BlockNote instance with native selection, formatting, history and CommentsExtension; do not retain per-page editing hosts or a second DOM selection/comment toolbar. Present/Video consume independent snapshots and cannot steal focus or mode while editing.

Read `docs/rfc-document-ir.md` and the exact `TeachingDocument` contract before changing transactions. JSON Schema, IDs, references, tree ownership, component parameters/states and media ranges are validated through `validateDocument`. Agent and Web changes use the same document transaction boundary and `baseDocumentVersion`. Saving valid document content does not wait for compilation. Snapshot compilation failure retains the last successful snapshot and identifies its source version.

Workspace MCP authoring uses `get_authoring_capabilities`, the canonical readers below, `plan_document_change` and `apply_document_change` through the same `DocumentEditor` instance as HTTP. Preserve schema validation, all file bases, locking, rollback, history and saved-source readback; do not compile to discover the canonical authoring tools or mount a document merely to read/save it. Host-level author routes retain the workspace launcher-token gate. Compiler-only stdio explicitly lacks authoring, and required-review apply remains unavailable until its real review adapter is implemented. The capability matrix and feedback plan are in `docs/rfc-mcp-authoring-actions.md`; unimplemented actions must not be advertised as available.

Canonical Git history uses one workspace `DocumentHistory` owner for Web and MCP. `get_document_history` returns bounded original-change pages and full-chain state; `read_history_file` reads an immutable same-document text blob. Undo, redo and per-row revert require the returned raw-source binding, actual HEAD snapshot and full target commit. Keep root document `''` distinct from Home, enforce both historical ownership and current path policy, and refuse staged-only target changes. Reuse Revisions and document locks, including failed-write/index rollback; do not add a writer, checkout/discard endpoint or bridge native editor history to Git. The exact protocol and process-local receipt limits are in `docs/document-history.md`.

Project directory operations use `DocumentOperations` and the existing writer/Revisions transaction. Failed commits must restore regular files, binary bytes, original symlinks and index without sweeping unrelated dirty/staged changes. Root-document copy/rename/delete are unavailable while their workspace-control scope is undefined. Temporary preimages are bounded to 16,384 entries/512 MiB; keep the typed refusal and disclose that gate, never silently skip files. A validation refusal must not rewrite untouched files. After mutation starts, discard the preimage only after confirmed commit or successful restoration. An unreadable commit state returns `project-commit-state-unavailable` with `committed:'unknown'`; do not assume success or rollback. If filesystem rollback itself fails, retain the private preimage and return `project-rollback-failed` with `recovery.directory`; its protected `recovery.json` maps original paths to saved entries. Do not delete that recovery material before an operator verifies restoration, or claim the original paths were restored. See `docs/benchmarks/project-operation-safety-2026-10-28.md`; Project management now uses the shared `project/capabilities`, `project/plan` and `project/apply` owner, including Web; never reintroduce bare `POST documents` writes. Keep fixed UUIDs, actual HEAD/config/tree/template bindings, classified-reference impact, explicit deletion confirmation and current-result receipt checks. Root directory operations remain unavailable. See `docs/benchmarks/project-authoring-plans-2026-10-28.md` for the bounded implementation and staged real evidence.

Transcription and adoption are workspace-owned shared instances, also exposed through MCP and the Studio proxy. Remounting compiled plugins must not replace or close their tasks. Resolve the target document's real speech/audio Node services through `Compiler.nodeServices()`, with exact source checks, without running scene compilation or passes; configuration-only capability is not provider authentication. Task list/query/result/cancel read durable state without loading those services. Keep list scanning, concurrency and reply size bounded, expose malformed journals as issues, and mark older document identities or invalid source as stale. Host authorization supplies confirmation and selects agent/editor origin; model payloads never choose them. Text-only ASR protocol results receive a stable segment without invented times, at the producer before candidate revision is computed.

`preview.prepare` uses the existing authoring-client request and Workbench preparation owner. Preserve Doc mode and position, pause first, and report only a genuinely prepared canonical source/IR/project revision. Advertise and adopt through the same clean source/timing/page/history and public modal gate. The original 30-second request deadline and AbortSignal must reach that owner, including cancellation, disconnect, input and switches; checking ownership only after adoption is insufficient. Human preparation retains its 45-second timeout and visible failure. Observe public aria-modal and native input only during the request; do not read draft values, infer selection, or claim complete form inspection. Shared IR compilation may finish in the server cache after a borrower cancels, but must not be adopted by the stale browser owner. Replay the same receipt without recompile and read current state after uncertain results. See the implemented boundary in [MCP authoring §9.1](../../../../docs/rfc-mcp-authoring-actions.md#91-已接入的客户端动作).

Explicit `comment-drafts.inspect/read` borrows the current trusted member/document's existing bank and readonly reader. Never invoke settling `refresh`, create a second store, or place candidates in passive snapshots. Whitelist metadata; target signatures, baselines and pending values contain prose. Latest session input must shadow older IndexedDB bytes. Bind every fragment to exact draft id/revision/token, client/source ownership and bank generation, including clear/discard intent before strict storage completes. Preserve historical receipts with `current:false`; don't reread on replay. Reassemble UTF-16 JSON-text fragments before parsing and verify the full UTF-8 digest. Fit complete receipt, HTTP ACK and the existing 8 KiB WebSocket envelope, not content length alone. Restore/discard and unwired form families remain unavailable. Exact format, readiness and limits are in [MCP authoring §9.2](../../../../docs/rfc-mcp-authoring-actions.md#92-已接入的显式批注草稿读取).


Explicit `component-drafts.inspect/read` uses the existing `ComponentPropertyDrafts` owner and a scope-bound readonly observer. Whitelist metadata; never spread the draft record, baseline or workspace/member identity. Read exact id/revision/token/block/step JSON-value fragments, with the same complete receipt/ACK/WebSocket budget as comments. Latest session input wins over older disk bytes even after strict backup failure. Clear/recover/discard immediately invalidate agent reads; their scope-wide read gate must not reject another target's human clear or recovery. A foreign backup marker does not discard this tab's visible input. Stop the observer on document switch and close. Cross-window BroadcastChannel notifications are asynchronous: receipts describe observed snapshots/revisions, not global linear consistency. No MCP draft mutation is exposed. See [MCP authoring §9.3](../../../../docs/rfc-mcp-authoring-actions.md#93-已接入的显式组件属性草稿读取).

Canonical audio authoring uses one `createDocumentAudioAuthoring` instance for host-level HTTP, compiled route mounts and MCP. Preserve its process-local receipts, source/file checks and atomic binary transaction; compiled remounts only borrow routes. Workspace-file preflight returns real digest/length/media metadata without assigning a canonical asset ID; import validates those bytes again, and saved-file readback explicitly leaves compilation and runtime unrequested. Use SourceEditor’s shared path policy before receipt lookup, plus the audio hidden-path restriction. Agent origin and required review are host-owned. Closing the workspace blocks new service discovery, aborts pending reads/probes and waits for transactions/readback; never duplicate the upload writer or speech queue in a tool adapter. The exact tools and limits are in `docs/audio-authoring.md`.

Recording narration can set an optional `sourceRange` only after the same asset is adopted by the target step. Reuse the original adoption transaction, SHA/duration checks and readback; scope the override to that step. The plan, MediaClock and exporter consume the same real in-point and used duration. Keep the full narration and original bytes, report caption alignment as none, and retain the existing internal-cue/start restrictions. Pending range fields are view-session input, not a second canonical or durable draft store.

The same audio owner now reads an existing production plan, preflights clip changes and commits them for Web/MCP. Plan reads never compile implicitly; an absent snapshot is unavailable, and actual returned bindings remain mandatory for upserts. Remove broken clip references without requiring a repaired plan, but retain their assets and bytes. Preflight retains no plan and apply checks source, real media and confirmed timing again inside the original transaction.

Voice discovery uses one `createDocumentVoiceAuthoring` instance, also before compilation. Web and MCP catalogue reads bind the actual canonical source and retain unsupported/unknown states; configuration-only and the VOICEOVER marker are not generation success. Shared catalogue fetches have independent borrowers: aborting one reader must preserve its peers, and the last reader must release the actual request. Failed or aborted older entries cannot remove a newer cache entry; cancelled consent cannot poison catalogue capability. The exact boundary is in `docs/voice-authoring.md`.

The same service owns per-document voiceover tasks through the shared kernel Node coordinator and the actual `VOICEOVER_EXECUTION`. Compiled contributions borrow `DOCUMENT_VOICE_TASKS`; standalone servers close only their own owner. Keep list/get/cancel independent of current JSON, service discovery and compilation. Start fixes source/IR/scope and actual execution; sequence changes only with state or progress. Preserve pre-admission cancellation, the existing generation lock and explicit spending. Quote and preview reads are tracked during close; MCP returns a bounded binary resource, never data-URI text or a fabricated playback acknowledgement. Do not restore the unobservable synchronous `lecture_synthesize` tool beside this owner.

Video and its dialog borrow one cheap `voiceover/jobs` observer; defer cache refresh while input is dirty/composing or recording is requesting/recording/stopping, and bind late plan callbacks to the full read-start ProductionBinding even when source and IR are unchanged.

Page creation, renaming, moving and deletion operate on stable section IDs/order and explicit block ownership; no Markdown headings, source ranges, parsed fingerprints or syntax-preserving writer are authoring contracts. Preserve referenced steps/narrations and reject deletion that would leave dangling bindings. Code and assets remain project references.

Page duplication uses kernel `duplicateDocumentPage` with an injected ID allocator; keep the Web actor, focus, native text Undo and existing page-history path. MCP `plan_page_duplication` returns a compact source/planId/digest/target/count summary; `apply_page_duplication` takes that short reference and retrieves the exact candidate for the original apply/transaction/receipt owner. Full candidate, copied-ID mapping and details are optional resources with member/document/digest/TTL checks. Keep default outputs below the bundle's 8192-character pruning threshold and do not make the model echo a document. Preserve opaque payloads, shared assets/definitions and original comment anchors; remap only declared canonical references. Retain review/CAS checks without compiling or adding a second writer or replay ledger.

Page creation, rename, move and deletion share kernel page rules with `plan_page_change` / `apply_page_change`. Preserve native insertion focus and Undo; share only the allocated page/block/paragraph/step identities and 4000 ms hold / 500 ms pause defaults. Preflight returns a compact target and impact with optional full resources; apply only the unchanged source/planId/digest. Deletion requires explicit `confirmDeletion:true` bound to that planned delete, checks cues in every retained narration (even unused ones), and detaches only declared deleted text anchors. Keep shared narration, assets, definitions and discussions. Last-page deletion retains the page title and one empty step. Retain the existing bounded plan/receipt, agent review, CAS and readback owner; no compilation, extra writer, silent replan or cross-process guarantee. Page requests/results must pass the actual 2048/7168 JSON budgets and DSH pruner; legacy generic large writes remain separate.

Canonical agent reading starts with `get_document_outline`, then `read_document_part` for full stable entities or fields. Preserve source on every continuation, distinguish title previews from complete values, and reconstruct explicit JSON-text fragments using returned UTF-16 offsets before parsing once. The shared service measures escaped pretty JSON against its 7168-character budget and rejects changed source, including newly invalid JSON; it has no read snapshot ledger or compilation prerequisite. Keep the legacy full SDK reader unchanged and do not substitute compiled `get_section/get_step` data. Exact limits and the remaining large-write gap are in [the authoring RFC](../../../../docs/rfc-mcp-authoring-actions.md#18-已实现的版本绑定局部读取).

Keep native history responsive, including toolbar Undo immediately after typing. External projections and saved acknowledgements are baselines, not new undoable edits. Draft recovery is bound to workspace/document identity and version. A late acknowledgement, generation result or response after switching documents cannot clear newer input or be adopted by another document.

The removed-location notice belongs to the deleted stable target and its original canonical source, document scope, selection generation and position token. Retire only that notice when the exact clean source restores the target and all owners still match; never restore focus, scroll or selection as a side effect. Later input, navigation, document switches and newer failures take priority. Matching section/step strings in a different source are insufficient, and dirty or saving snapshots cannot confirm restoration.

Comments use native rich-text ranges with stable editing-unit IDs, offsets and document version. Cross-block selection must use the editor's public APIs; do not rebuild range ownership from independent DOM selectionchange handlers. Persist only Presmium document data through the source transaction boundary; an editor's internal Y.Doc is not a second storage format or a multiplayer system. Web and MCP use the same pure canonical comment actions; keep native create immediate so BlockNote attaches the mark to its original selection. Use the trusted Workbench member, retain earlier authors, and apply owner/editor permissions in both native auth and the pure reducer. MCP plans fix IDs/time/member and use the same bounded plan/transaction/receipt owner as voice.set, with short references rather than full-document echo. Keep omitted comment metadata and opaque values intact. Canonical anchor v1 shares the native text/break-link predicate; complex inline values are one atom and invalid offsets must not be clamped.

Keep the existing-thread floating controller mounted while body selection owns the pointer, but close its public popover and hide its closing snapshot. A collapsed DOM flag is only a visibility gate at the completed pointer interaction; it must never map, store or write a range. Preserve the native thread/reply editor and the first marked-click/link consumption adapter. See `docs/benchmarks/native-comment-pointer-selection-2026-10-28.md`.

Clean external comments/production changes must preserve native body history and unsent reply selection. Sync the latest actor version before a native snapshot, including transaction mapping after a previous silent mark update. For an existing comment edit, bind the public Comments.Editor to its stable projected body IDs, pin only its editing view, and guard public submit against target-body changes. A blocked submit keeps the draft; snapshots still contain latest canonical data, and explicit Cancel reveals it. Unrelated replies/reactions must not block the edit. New empty reply/create editors are not existing-comment edits. Keep the dependency's other badge behavior; a reaction label must not activate its input twice, and pointer activation must still transfer control focus for keyboard use. Reply and existing-comment edits use Workbench-owned strict comment backups, bound through public Thread identity, trusted member and stable target creation/body baselines. Keep per-editor input continuity while native Thread retains its reply editor. Recovery requires explicit exact selection and strict preservation before switching; stale target edits cannot submit, and removed targets offer read-only retrieval without rebinding. Only a verified clean canonical acknowledgement retires the submitted record; actor content merged with later dirty/saving/error/restored/composing input is not an acknowledged source. Update this gate even when the version is unchanged, and read the latest actor state before React commits. Later input and other tabs survive. A new-thread composer binds the actual public FloatingComposer editor to a creation intent and canonical stable range/content signature, never a fake thread ID. Explicit recovery strictly preserves/forks first, then uses one public native TextSelection command; changed or missing ranges remain read-only retrieval. Recheck the latest source, native projection/selection, position owner, input and both main/composer IME after every await. A successful recovery closes only the comments aside so the native form remains usable on narrow screens. Start the same backup reader when the source becomes available after initial loading. MCP access to these client bytes remains unavailable. Exact protocol and staged evidence are in [RFC 20](../../../../docs/rfc-mcp-authoring-actions.md#20-已实现的批注与音色语义计划).

Generated content is changed through explicit parameters, definition scope, chat or comments. Unknown versioned plugin data remains intact with readable capability diagnostics. Real authoring checks cover complete final-page content, ordinary Enter/list/formatting behavior, comments, arbitrary step jumps in preview, immediate Undo, save failure/recovery, document switching and actual light/dark desktop/narrow combinations.

Presentation has no separate workbench status/recompile/exit toolbar. The bottom viewer bar requests recompile and exit through the typed `presentation-action` preview report, accepted only from the active selected frame. The owning document or production view performs the existing compilation and pause-before-exit flow; do not make iframe view changes stand in for workspace exit.

Presentation playback shares one horizontal row with viewer navigation, including the progress slider (no separate top-edge progress or duplicate page/step counter): icon Play/Pause and Captions, an accessible range and time, and a More menu for speed, caption language, caption list and chapters. Use public host controls and a Drawer for the read-only lists; do not add a second playback bar or show voice-provider badges in replay controls. Export provenance remains intact. Presentation playback uses ordinary Play/Pause controls. Direct interaction pauses automatically; Play resumes from the current position and restores the timeline internally when needed. Do not expose separate try/return modes or require the viewer to manage playback ownership. Read-only text is labeled as a caption list, not a second authoring document. Presentation captions use the shared host caption overlay inside the slide bounds, keep readable screen-sized type, and never resize or move the slide when they appear or disappear.

The document caption sidebar exposes only captions and narration start. Voice choice, inheritance, pronunciation, hold and trailing pause belong to video production; its `DocumentVoiceField` and `DocumentVoiceDialog` keep the shared canonical Production settings. Selecting a voice never starts synthesis. The verified document/video boundary is `docs/benchmarks/document-caption-scope-2026-10-27.md`.

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
their original target and version. Canonical Step IDs remain authoritative; runtime numeric steps,
trails and media maps are projections. Preserve stable IDs and validate the source/revision binding
instead of treating array indexes as identity.

Canonical body/caption backups use `DocumentDrafts` and strict IndexedDB transactions. An admitted snapshot is not yet durable: only the latest generation transaction completion may clear its pending/failure state. Check actual whole-browser termination, exact candidate tokens and put/clear ordering when changing this path; recovery must commit a new backup before replacing local input and must not automatically write the canonical source. See `docs/benchmarks/document-durable-drafts-2026-10-27.md`.

Step-script drafts are keyed by document, section and step in `narration-drafts.ts`, with a workspace-scoped
browser recovery record and a source baseline. Saving is serialized with body edits and confirms only its
submitted source/edit version; preview compilation is separate. Follow RFC section 6 for debounce and composition
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

Build/export requests first flush the active canonical document actor and bind its acknowledged source version and fingerprint. Composition, recovered drafts, raw timing drafts and conflicts must remain visible and prevent submission. Switching documents or cancelling while awaiting the save cannot start an output later. The workspace job service confirms that source again and records it separately from the compiled IR revision; reuse also checks the actual tracked inputs, including translations. Verify the output file's text, not only the job's success state. A late job response cannot clear newer document input.

Diagnostics are the workspace service's current snapshot (5.4); the workbench and MCP subscribe to the same
source.

Authoring-window errors use `diagnostics/authoring` without waiting for an IR. Keep the request-start saved baseline in `authoringSource` when known; unknown is not a fabricated runtime revision. Reports clear only their member/instance contribution and must not recursively observe their own failures. The preview's revision-bound runtime producer remains separate. See `docs/diagnostic-feedback.md`.

- A new warning is verified for appearing, clearing on recovery and isolation between documents; reading the
  diagnostics resource does not run a full check.
- dsh injects the concrete diagnostics before a model step; a failed subscription is reported as
  unavailable; notifications do not start the model by themselves.
- The workbench only says "some content could not be shown correctly"; the raw text is under "Details".
  "Let AI fix it" and comments go to the current session through
  `packages/dsh/src/client/agent-requests.ts` and keep the input draft. Chat requests retain the selected focus.
- When judging the agent's environment feedback, tell apart the tools `get_diagnostics` (reported snapshot), `check_document` (explicit compilation and checks),
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
