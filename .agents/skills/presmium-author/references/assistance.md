# Editing and questions with AI

First tell who is asking: an author having an agent change the source, and a reader asking about the lecture, use different entry points and model settings.

## The author edits in the workbench

Open the lecture in the workbench as described in the author skill. Manual editing and preview work without a model; to chat, pick an existing service in the workbench's model settings and fill in the address, key and model the user chooses.

Locate the relevant section first, or pick the block in the preview, then say what should change. After the agent edits, review the source diff and the preview; accepting makes a git commit, rejecting restores the affected files. Do not treat "the chat finished" as the author having accepted the change.

The workbench suits a teacher who describes the teaching intent, lets the agent edit and looks at the result; for full code editing use the VS Code extension. `get_diagnostics` reports source problems, `get_outputs` returns the recordings made while preparing, and only `get_runtime` is feedback from code the author's browser actually ran: code location, failures, text results and session resets. The harness fetches the latest summary automatically; call the tools when you need detail. No open window, an old run result, or a successful build does not prove that the code just changed was verified in the browser; after changing a standalone Python file, check it with the interpreter or the related tests.

Python code outside the lecture in the file tree can also be selected and handed to the agent; the focus carries the workspace-relative file path, line numbers, an excerpt from disk and the unsaved selected text. After the focus is cleared or the lecture changes, the old selection is no longer carried. The editor position stays the same before and after selecting, so the teacher can point at a problem with the mouse.

## Keeping the user's own editor or agent

Edit the MyST source directly; the dev server updates the preview. Connect Presmium's MCP server only when an agent needs to query the lecture's structure, diagnostics and the current position.

After `presmium dev` or `presmium serve` starts, the terminal prints the MCP address and the state file that holds the token. Connect to the HTTP endpoint the way the user's client is configured, with the request header `Authorization: Bearer <token>`. Read the token for this process from the state file; never write it into the lecture or a shared address.

When no preview server is needed, install `pnpm add -g @lincyaw/mcp` and run `presmium-mcp <lecture directory>` as a stdio server. It provides read access by default; for other operations read its command help and configure it for the task.

After connecting, discover the tools the server actually provides, then query sections, steps, code and diagnostics. MCP itself offers no general file writing; the agent still edits the source with its own file tools. Some operations may need confirmation in the page; follow the prompt that appears.

## Adding a question box for readers

When the lecture lists `@lincyaw/addon-assistant`, the built static site can answer questions too. Each reader fills in their own OpenAI-compatible service address, key and model under **Ask**; the question and the related lecture content are sent directly from their browser, and their service pays for it.

The model settings are kept in the site's browser storage, which scripts of the same origin can read. Never prefill the author's key in published output, and do not mistake the workbench's model settings for a model shared with readers. A student build contains only student content, and questions take their context from that content.

To verify, select some related text and ask; check that the citation leads back to the right section. In a classroom, an AI answer the presenter generates for a question stays in the presenter window until they click **Send to the classroom**; the classroom flow is in `presmium-present`.
