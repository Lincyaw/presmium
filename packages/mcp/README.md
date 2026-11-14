# @lincyaw/mcp

Presmium's agent environment: a document's tools and resources over MCP, for agents such as Claude Code, Codex or VS Code.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Connect

Configure the AI tool once with the stdio command `presmium mcp <workspace-or-document>`. Use an absolute directory or document path so the target does not depend on the client's working directory. A project made by `presmium new` has a `.mcp.json` for Claude Code; launch it from the project directory. For other clients:

```sh
claude mcp add presmium -- presmium mcp /absolute/path/to/workspace
codex mcp add presmium -- presmium mcp /absolute/path/to/workspace
```

`presmium mcp [directory-or-lecture.json]` uses the nearest enclosing `presmium.workspace.yaml`, or the document's directory when there is no workspace configuration. It reuses an existing Studio or `presmium serve` for that workspace; otherwise it starts the workspace service using the same Presmium installation. The service is ready before MCP initialization completes, so the initial catalog offers authoring and captures. A browser window and a model are not required. Open Studio separately when an operation needs browser state or an approval window.

| Mode | Tools |
| --- | --- |
| Default `presmium mcp` | Authoring, history, projects, transcription, voiceover, audio and images, captures, builds and browser-client actions. Availability still follows the workspace configuration, credentials, approvals and connected windows. Use `list_documents` and name `document` when the workspace serves several documents. |
| `presmium mcp --compiler-only <document>` | Standalone document compilation: reading, diagnostics and skills, with `run_code` and `build` when their kinds are explicitly allowed. No workspace authoring or captures; does not start or reuse a workspace service. |

Multiple stdio clients share one workspace service. A client that reuses Studio or another service leaves it running when the client closes. A client that starts the service closes it and releases its workspace lease on exit; surviving stdio clients can acquire a replacement for subsequent requests. A Studio opened later with default local listener settings borrows that service, and closing Studio leaves it running. The originating stdio session remains the owner: keep it open while using that Studio. Closing the owner terminates the borrowed service and ends Studio; Studio does not migrate to a replacement host. To use explicit Studio `--host`, `--preview-port` or `--preview-url` settings, stop the existing service and start Studio with those settings first. A service started by an older Presmium version may require stopping it before the current Studio can attach.

Service discovery follows process identity even when the address and token stay the same. Sent business requests remain bound to their original connection and are never replayed. Check saved state or job history after an unknown outcome. Only readonly subscriptions are restored automatically.

The servers also serve MCP at `/mcp` over Streamable HTTP, with `Authorization: Bearer <token>`. When Studio starts its own workspace service, it defaults to port 4321 and preserves its access token for the same launch directory across restarts and upgrades. A Studio borrowing a service uses that service's address and token. Read the file printed at startup; a service-state JSON file holds the credential in its `token` field. `presmium dev` and `presmium serve` also print their address and token-file path. The standalone `presmium-mcp` executable can relay to an existing workspace service; automatic service startup is supplied by the main `presmium mcp` command. Use `--compiler-only` explicitly for standalone compilation.

### From the command line

Use the connected native MCP tools when an AI client already exposes them. Scripts and pipelines without an MCP client can call the running service from its workspace directory:

```sh
presmium mcp tools                                     # name, kind (read, operate, spend, write, agent) and summary of each tool
presmium mcp tools rename_page                         # live definition and input schema, directly from tools/list
presmium mcp tools --json                              # complete live tool definitions
presmium mcp call list_documents
presmium mcp call operations '{"query":"project"}'
presmium mcp call read_operation '{"operation":"get_project_capabilities"}'
presmium mcp call rename_page '{"section":1,"title":"New title"}'
presmium mcp call capture_slides '{"document":"intro","section":"p-problem"}' --out shots
```

`call` takes the tool's arguments as one JSON object (default `{}`) and writes the result to stdout as JSON: the structured content, else the result's text. Pictures the tool returns (`capture_slides`, `capture_reading`, `capture_overview`) are saved with `--out <dir>` as `<tool>-00.png`, `<tool>-01.png`, …; their paths, and every other message, go to stderr, so stdout pipes to `jq`. The local owner's access token authorizes ordinary canonical editing without another Studio prompt; full replacement and file writes through the generic interface, execution, paid generation and browser control keep their own confirmation policies. Other issued tokens keep their existing policy. It exits 0 on success, 1 when the tool reports an error (its result is still written), and 2 on a usage error, an unknown tool, or when no service runs for the directory.

`rename_page` handles an explicit title change in one call. `edit_document` handles canonical content operations through the same read, preflight and save transaction internally. Both return saved-source verification and reported editor synchronization separately from preview preparation; they do not automatically compile or generate voiceover. Pass optional source when intent depends on an earlier read. A conflict requires a fresh decision, and a lost response requires checking current state before repeating a write. Plan/apply tools remain for advanced impact review. Simple edits use their receipt; compilation and capture follow the task scope. Plugin tools appear once their compilation is ready; follow tool-list change notifications.

The CLI accepts both compact discovery/dispatch tools and original operation names, selecting the matching endpoint automatically. Named schema queries work for both (`presmium mcp tools operations --schema`); `tools --all` lists the original operations.

## Tools

| Group | Main tools |
| --- | --- |
| Skills | `list_skills`, `read_skill` |
| Reading | `list_documents`, `deck_info`, `list_sections`, `get_section`, `get_step`, `search`, `get_code_ref`, `get_outputs`, `locate_source` |
| Diagnostics | `get_diagnostics` (reads the snapshot), `check_document` (runs compilation and plugin checks) |
| Runtime and focus | `get_runtime`, `get_focus`, `get_position`, `navigate` |
| Run and build | `run_code`, `build`, `get_builds`, `cancel_build` |
| Pictures | `capture_slides`: a page's steps as the presentation shows them (rest frames, `at` moments into the animation, or reached going `backward`), as PNG images, with the boxes of the elements a CSS selector `measure`s; `capture_reading`: a page of the reading version at a window `width`; `capture_overview`: every page at once, as sheets of thumbnails and a directory of frames in reading order |

Capture results include `capture` with the browser's document `source`, loaded `codeBundle` when available, and a `manifestFile` pointing to `capture.json` beside this request's files. Use `retain: true` to keep review evidence in the service cache beyond its recent-capture cleanup; this does not archive it into the project. Review only the listed files from the same source and code bundle. Timed captures use `direct` with `at`; `backward` checks arrival at rest in a separate call without `at`. Combining them fails with two suggested calls rather than silently ignoring the moments.
| Classroom | `get_classroom`, `classroom_start`, `classroom_end` |
| Canonical reading | `get_authoring_capabilities`, `get_document_outline`, `read_document_part`, `get_document` (full document, may exceed a tool-result budget) |
| Document changes | `edit_document`, `plan_document_change`, `apply_document_change` |
| Pages | `rename_page`, `plan_page_change`, `apply_page_change`, `plan_page_duplication`, `apply_page_duplication` |
| Comments, voice settings, component parameters, caption timing | `plan_authoring_action`, `apply_authoring_action`, `read_authoring_action_impact` |
| History | `get_document_history`, `read_history_file` |
| Projects | `get_project_capabilities`, `plan_project_change`, `apply_project_change` |
| Transcription | `get_transcription_capabilities`, `start_transcription`, `get_transcriptions`, `get_transcription`, `get_transcription_result`, `cancel_transcription`, `plan_transcription_adoption`, `apply_transcription_adoption` |
| Voice and voiceover | `get_voice_authoring_capabilities`, `get_voice_catalog`, `get_voiceover_status`, `start_voiceover`, `get_voiceover_job`, `get_voiceover_jobs`, `cancel_voiceover`, `quote_voice_preview`, `preview_voice` |
| Audio and clips | `get_audio_authoring_capabilities`, `inspect_workspace_audio`, `import_workspace_audio`, `inspect_document_audio`, `adopt_recording`, `read_production_plan`, `validate_media_clip_change`, `change_media_clip` |
| Images | `get_image_authoring_capabilities`, `inspect_workspace_image`, `import_workspace_image` |
| Browser clients | `get_authoring_clients`, `request_authoring_client`, `get_authoring_client_request` |

`get_section` and `get_step` read derived runtime data. To edit, read canonical content with `get_document_outline` and `read_document_part`, then plan and apply. Every change follows the same pattern: a `plan_*` call returns a bounded plan with source, plan id and digest; the matching `apply_*` call commits exactly that plan through the same service the Web editor uses, and reports the saved result. A saved result does not prove compilation or playback. Deletions also need `confirmDeletion: true`. A source change between plan and apply returns 409; plan again instead of retrying with a new id.

## Resources

| URI | Content |
| --- | --- |
| `presmium://documents` | Documents served |
| `presmium://deck` | Deck summary |
| `presmium://sections`, `presmium://sections/{section}`, `presmium://sections/{section}/steps/{step}`, `presmium://sections/{section}/outputs` | Sections, steps and recorded outputs |
| `presmium://ir` | Compiled deck (reading it prepares the IR when needed) |
| `presmium://diagnostics` | Current diagnostic snapshot; subscribe to hear of changes |
| `presmium://runtime` | Reports from the author's open browser windows |
| `presmium://focus` | What the author points at in the workbench; subscribable |
| `presmium://position` | Presentation position; subscribable |
| `presmium://classroom` | Classroom state |
| `presmium://skills`, `presmium://skills/{name}/{path}` | Skill catalog and paged skill files |
| `presmium://authoring-action/…`, `presmium://page-change/…`, `presmium://page-duplication/…` | Full candidates and impact of a plan |
| `presmium://voice-preview/{id}` | Audio of a generated voice preview |

With several documents, add `?document=<dir>`, for example `presmium://sections?document=lectures/intro`.

## Approval

Each tool has a kind: `read`, or one of the approval kinds `operate`, `spend`, `write` and `agent`. Read tools run without asking. The local owner's credential authorizes ordinary canonical document editing; execution, paid generation, source-file writes and browser control retain their own confirmation policies. Other issued tokens retain their policy and document binding. An operation that needs approval waits in an open Presmium window or uses the client's host confirmation under Presmium's policy. A refusal returns 403 `operation-not-allowed`; do not repeat the refused request. With no approval window, it returns 403 `approval-unavailable`. Open Studio or explicitly configure the applicable kind in the workspace's `approvals`. `presmium mcp --allow <kinds>` configures only a service this process starts; it never changes an existing service's policy. Automatic startup does not grant paid generation or source-file writes. In `--compiler-only` mode, `--allow` determines the execution kinds offered and allowed by that compiler host.

## Not supported

- Compiler-only stdio has no workspace services (authoring, history, projects, transcription, voiceover, audio).
- Retry receipts and plans are kept per process only.
- Configurations that require agent review reject canonical apply.
- Large generic `plan_document_change` and `apply_document_change` inputs are not bounded; their results leave the document out (read it with `read_document_part`).

## Documentation

- [Author actions](../../docs/authoring-actions.md): the shared plan, commit and verify protocol, limits, recording, transcription, voiceover, audio, history and diagnostics.
- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json): agents in your editor.

## License

Apache-2.0
