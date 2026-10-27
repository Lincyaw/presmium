# @lincyaw/mcp

Presmium's agent environment: a document's tools and resources over MCP, for agents such as Claude Code, Codex or VS Code.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Usage

`presmium dev` and `presmium serve` serve it at `/mcp` and print its address and the file that holds its token. Without a server, run it over stdio:

```sh
pnpm exec presmium-mcp <document directory>
```

The reading tools (`list_sections`, `get_section`, `get_step`, `search`, `get_code_ref`, `get_outputs`, `get_diagnostics`, `locate_source` and others) are always there; `--allow operate` also provides `run_code` and `build`.

The workspace host behind `presmium serve` also provides canonical authoring. Start with `get_authoring_capabilities`, read saved `lecture.json` through `get_document`, preflight a `DocumentChange` with `plan_document_change`, then submit the identical change and its `planId` to `apply_document_change`. Web and MCP share CAS, same-document text-file transactions, locking, rollback and history. The result confirms saved source and files; compilation and playback remain separate. Existing semantic operations are advertised in capabilities, and a complete replacement is available for explicit structural changes.

Authoring initialization and reads do not wait for compilation. Plugin tools appear after their actual compilation is ready; clients should follow tool-list change notifications. Compiler-only stdio reports authoring unavailable. Required agent review is not integrated with canonical apply yet, so that configuration rejects apply; retry receipts are limited to the current process and saved result. See the [authoring actions RFC](../../docs/rfc-mcp-authoring-actions.md) for the remaining capability and feedback work.

Transcription uses the workspace's shared task service. `get_transcription_capabilities` reports actual Node service configuration without compiling scenes; `configuration-only` does not verify provider authentication. `start_transcription` is a spending action with host-owned confirmation. Discover tasks with `get_transcriptions`, poll one with `get_transcription`, read its exact candidate revision with `get_transcription_result`, and cancel through `cancel_transcription`. HTTP and MCP use the same durable task journals, including pre-admission cancellation.

To adopt text, call `plan_transcription_adoption` with explicit stable step targets and segment choices, resolve protected pronunciation/cue conflicts, then submit the returned plan to `apply_transcription_adoption`. The tool uses the same canonical transaction as Web and records agent origin; it cannot select the editor write path or bypass required review. Adoption does not change the selected voice or start synthesis. Task discovery reports corrupt journals as issues and marks old document identities or invalid current JSON as stale. Standalone stdio has no transcription authoring service.

`get_runtime` (also `presmium://runtime`) reads the author's open browser reports: timestamps, section and step, plugin/component failures and live execution status. It differs from the compiled recordings returned by `get_outputs`. Only editor/owner windows of the selected document contribute; closing a window removes its feedback. An empty list means no observed browser state, and earlier results do not verify a new source revision.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json): agents in your editor

## License

Apache-2.0
