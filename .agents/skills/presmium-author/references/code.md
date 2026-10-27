# Code and project references

A code block saves `language` and either a literal `value` or an `origin { anchor, pin? }` reference, never two competing sources. Keep large or executable implementations in project files. Use stable references and fingerprints when supplied by a resolver; do not copy generated code from a runtime snapshot back into the document.

Anchor file paths are relative to the logical workspace root. The studio supplies that root explicitly; document commands use the nearest ancestor `presmium.workspace.yaml` within the git repository, or the git root when no configuration exists, or the document directory outside git. A workspace nested in a repository uses its own relative paths; pinned commits and permanent links still address the real git files. Moving or copying the entire workspace does not require rewriting its anchors.

Code execution is explicit `execution` with `when` (`compile`, `live` or `both`) and optional executor, arguments, stdin, timeout and session. Operator environments and credentials are workspace/operator settings. Inspect a command before executing it; a document preview does not authorize paid services.

Highlights are keyed by stable step IDs. Variants have stable IDs and their own value or source reference. Keep existing origins, variants and scopes when revising adjacent text.

For a custom animation, create a component definition pointing to a project file and bind declared states on the document steps. See `presmium-animate`. A component's structured parameters and versioned data are not Markdown directive text.

```sh
presmium check lesson --json
presmium check lesson --env
presmium build lesson --to notebook
```

Only probe execution environments when the task needs it. Report missing capabilities rather than showing fabricated execution output.
