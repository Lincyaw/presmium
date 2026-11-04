# @lincyaw/mcp

Presmium's agent environment: a document's tools and resources over MCP, for agents such as Claude Code, Codex or VS Code.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Connect

Run `presmium mcp` in the project as the AI tool's MCP server, over stdio. A project made by `presmium new` has a `.mcp.json` that does this for Claude Code; otherwise:

```sh
claude mcp add presmium -- presmium mcp
codex mcp add presmium -- presmium mcp
```

`presmium mcp [directory]` relays to the Presmium server running for the directory, read from its state file: the Presmium Studio or `presmium serve` of the directory or of the workspace above it, else the `presmium dev` of the document. The relay reads the endpoint again whenever the server cannot be reached, so the client's configuration names only the command. Studio defaults to fixed HTTP MCP port 4321 and keeps its access token for the same launch directory across restarts and upgrades. The client receives the server's whole tool set:

| Running for the project | Tools |
| --- | --- |
| Presmium Studio or `presmium serve` | Everything below: authoring, history, projects, transcription, voiceover, audio and images, pictures of slides and reading pages (`capture_slides`, `capture_reading`), builds, the author's windows and focus, several documents (name one with `document`; see `list_documents`) |
| `presmium dev` | Reading, diagnostics, skills, the presentation's position, `run_code` and `build`; no authoring and no pictures (start `presmium serve` or Studio for them) |
| Nothing | `presmium mcp` compiles the document itself: reading, diagnostics, skills, and with `--allow operate,spend` `run_code` and `build`. Start `presmium studio` and reconnect for the rest |

The servers also serve MCP at `/mcp` over Streamable HTTP, with `Authorization: Bearer <token>`; `presmium dev` and `presmium serve` print the address and the state file that holds the token. `presmium-mcp` is the same command as `presmium mcp`.

### From the command line

Scripts and pipelines call the same tools without an MCP client, from a directory whose service runs (found as the relay finds it):

```sh
presmium mcp tools                                     # name, kind (read, operate, spend, write, agent) and summary of each tool
presmium mcp tools rename_page                         # live definition and input schema, directly from tools/list
presmium mcp tools --json                              # complete live tool definitions
presmium mcp call list_documents
presmium mcp call rename_page '{"section":1,"title":"New title"}'
presmium mcp call capture_slides '{"document":"intro","section":"p-problem"}' --out shots
```

`call` takes the tool's arguments as one JSON object (default `{}`) and writes the result to stdout as JSON: the structured content, else the result's text. Pictures the tool returns (`capture_slides`, `capture_reading`, `capture_overview`) are saved with `--out <dir>` as `<tool>-00.png`, `<tool>-01.png`, …; their paths, and every other message, go to stderr, so stdout pipes to `jq`. The local owner's access token authorizes ordinary canonical editing without another Studio prompt; full replacement and file writes through the generic interface, execution, paid generation and browser control keep their own confirmation policies. Other issued tokens keep their existing policy. It exits 0 on success, 1 when the tool reports an error (its result is still written), and 2 on a usage error, an unknown tool, or when no service runs for the directory.

`rename_page` handles an explicit title change in one call. `edit_document` handles canonical content operations through the same read, preflight and save transaction internally. Both return saved-source verification and reported editor synchronization separately from preview preparation; they do not automatically compile or generate voiceover. Pass optional source when intent depends on an earlier read. A conflict requires a fresh decision, and a lost response requires checking current state before repeating a write. Plan/apply tools remain for advanced impact review. Simple edits use their receipt; compilation and capture follow the task scope. Plugin tools appear once their compilation is ready; follow tool-list change notifications.

## Tools

| Group | Main tools |
| --- | --- |
| Skills | `list_skills`, `read_skill` |
| Reading | `list_documents`, `deck_info`, `list_sections`, `get_section`, `get_step`, `search`, `get_code_ref`, `get_outputs`, `locate_source` |
| Diagnostics | `get_diagnostics` (reads the snapshot), `check_document` (runs compilation and plugin checks) |
| Runtime and focus | `get_runtime`, `get_focus`, `get_position`, `navigate` |
| Run and build | `run_code`, `build`, `get_builds`, `cancel_build` |
| Pictures | `capture_slides`: a page's steps as the presentation shows them (rest frames, `at` moments into the animation, or reached going `backward`), as PNG images, with the boxes of the elements a CSS selector `measure`s; `capture_reading`: a page of the reading version at a window `width`; `capture_overview`: every page at once, as sheets of thumbnails and a directory of frames in reading order |
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

Each tool has a kind: `read`, or one of the approval kinds `operate`, `spend`, `write` and `agent`. Read tools run without asking. A read-only token sees no operations. On the workspace server, every other tool waits for the author to allow it in an open Presmium window (the studio's app bar shows Pending Approvals), or for the client's host to confirm it by Presmium's approval policy; a refusal fails with 403 `operation-not-allowed` and retrying asks again. With no Presmium window open to ask, it fails at once with 403 `approval-unavailable`: open Presmium, or allow the kind with `presmium serve --allow operate` or `approvals` in `presmium.workspace.yaml`. Spending actions (`start_transcription`, `start_voiceover`, `preview_voice`) need their own approval. A token bound to one document cannot act on another. When compiling itself, `presmium mcp --allow` decides which kinds are offered and allowed.

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
