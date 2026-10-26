# Editing with the studio and an agent

Run `presmium studio <workspace-or-document>` when the Studio package is installed; open the complete address it prints. Editing and preview need no model. The document editor uses one native BlockNote editing surface across the whole document, including cross-block selection and native history/comments.

Web and agents modify the same `lecture.json`. Read the current document version, submit semantic edits or a full JSON document using the workspace's document transaction API, and retain unsaved input on conflict. `baseDocumentVersion` is the authoring CAS version, not a runtime IR digest.

Keep page, block, step, narration, asset and definition IDs stable. Save acknowledgement must match document, request and input version. A delayed save or generation result cannot clear a newer draft or become the current snapshot.

Preview compilation is independent. When it fails, retain valid document content, show readable diagnostics and identify the previous snapshot's version. Do not fix a preview by writing generated IR or silently replacing the authoring file with editor-private state.

For agent changes, state the affected objects and intended result, inspect the actual diff and validate the same document. Never infer a paid provider capability from a prototype or silently synthesize narration while editing.
