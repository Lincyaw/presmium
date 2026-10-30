# Code and project references

A code block saves `language` and either a literal `value` or an `origin { anchor, pin? }` reference, never two competing sources. Keep large or executable implementations in project files. Use stable references and fingerprints when supplied by a resolver; do not copy generated code from a runtime snapshot back into the document.

Anchor file paths are relative to the logical workspace root. The studio supplies that root explicitly; document commands use the nearest ancestor `presmium.workspace.yaml` within the git repository, or the git root when no configuration exists, or the document directory outside git. A workspace nested in a repository uses its own relative paths; pinned commits and permanent links still address the real git files. Moving or copying the entire workspace does not require rewriting its anchors.

Code execution is explicit `execution` with `when` (`compile`, `live` or `both`) and optional executor, arguments, stdin, timeout and session. Operator environments and credentials are workspace/operator settings. Inspect a command before executing it; a document preview does not authorize paid services.

For an operator-provided JupyterHub environment, declare `metadata.execute.environments.lab` with `kind: 'jupyter', auth: 'hub', profile: 'python', kernel: 'python3', languages: ['python']`. A live code block uses `execution.executor: 'presmium.env.lab'`; the same `execution.session` shares a kernel. Clicking Run or opening a terminal starts or reuses that reader's named environment. Reading, building and probing do not start it. Use only profiles offered by the operator; images, resource limits, user identity and tokens stay on the server. Static output cannot start Hub environments. Local operators can instead use `auth: 'proxy'` with their server-side address and token.

Highlights are keyed by stable step IDs. Variants have stable IDs and their own value or source reference. Keep existing origins, variants and scopes when revising adjacent text.

For a custom animation, create a component definition pointing to a project file and bind declared states on the document steps. See `presmium-animate`. A component's structured parameters and versioned data are not Markdown directive text.

```sh
presmium check lesson --json
presmium check lesson --env
presmium build lesson --to notebook
```

Only probe execution environments when the task needs it. Report missing capabilities rather than showing fabricated execution output.

In Studio, choose **Read and Run** to execute code in the document layout without entering the slide presentation. Its code controls reuse the same executors and named sessions as the presentation. Code edits in this reader are temporary execution inputs; choose **Back to Editing** to save changes to the authoritative document. Reading and execution do not replace the native editor.
