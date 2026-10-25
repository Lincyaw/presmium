# Editing and questions with AI

First tell who is asking. An author having an agent change the source and a reader asking about the document while reading use different entry points and different model settings.

## The author edits in the studio

Open the document in the studio as described in SKILL.md, "Choosing how to edit". Manual editing and the preview work without a model; to chat, pick an existing service in the studio's model settings and fill in the address, key and model the user chooses.

Locate the relevant section first, or pick the block in the preview, then say what should change. After the agent edits, review the source diff and the preview. When the workspace requires review (`review: required` under `settings:` → `presmium.assistant:` in `presmium.workspace.yaml`), accepting makes a git commit and rejecting restores the affected files; do not treat "the chat finished" as the author having accepted the change. Without that setting, each round of AI changes becomes a version directly, which the author can undo.

The studio suits a teacher who describes the teaching intent, lets the agent edit and looks at the result; for full source editing use the VS Code extension.

When you are the agent in the studio, these Presmium tools give feedback:

- `presmium__get_diagnostics`: the document's full checks (compilation and plugins), that is, problems in the source.
- `presmium__get_outputs`: the code output recorded when the document was compiled.
- `presmium__get_runtime`: what the author's browser last reported: plugin and component failures, and live code runs with their code location, failures, text results and session resets. It is the only feedback from code the browser actually ran.
- `presmium__get_section`, `presmium__get_step`: the compiled text and steps that readers see.

The studio adds a summary of the latest browser feedback to each turn by itself; call the tools when you need detail. No open window, an old run result, or a successful build does not prove that the code you just changed was verified in the browser. After changing a standalone Python file, check it with the interpreter or the related tests.

What the author points at arrives as the focus in the turn's `<presmium-document>` context: a section, block, step or quoted text of the document, or a range of a file elsewhere in the workspace with its workspace-relative path, line numbers and an excerpt from disk. After the focus is cleared or the author opens another document, the old focus is no longer carried.

## Keeping the user's own editor or agent

Edit the MyST source directly; `presmium dev` updates the preview. Connect Presmium's MCP server only when an agent needs to query the document's structure, diagnostics and the presenter's current position.

After `presmium dev` or `presmium serve` starts, the terminal prints the MCP address and the state file that holds the token. Connect to that HTTP endpoint the way the user's client is configured, with the request header `Authorization: Bearer <token>`. Read the token for this process from the state file; never write it into the document or a shared address.

When no preview server is needed, install `pnpm add -g @lincyaw/mcp` and run `presmium-mcp <document folder>` as a stdio server. It gives read access by default; for other operations read its `--help` and configure it for the task.

After connecting, list the tools the server actually provides, then query sections, steps, code and diagnostics. MCP offers no general file writing; the agent still edits the source with its own file tools. Some operations ask for confirmation in the page; follow the prompt that appears.

## Adding a question box for readers

When the document lists `@lincyaw/addon-assistant` under `plugins`, the built static site can answer readers' questions. Each reader fills in their own OpenAI-compatible service address, key and model under **Ask**; the question and the related content are sent directly from their browser, and their service pays for it.

These model settings are kept in the site's browser storage, which scripts of the same origin can read. Never prefill the author's key in published output, and do not mistake the studio's model settings for a model shared with readers. A student build contains only student content, and questions take their context from that content.

To verify, select some related text and ask; check that the answer's citation leads back to the right section. In a classroom, an AI answer the presenter generates for a question stays in the presenter window until they click **Send to the classroom**; the classroom is in the presmium-present skill.
