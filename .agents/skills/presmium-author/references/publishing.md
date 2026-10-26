# Publishing documents

The source is `lecture.json`; outputs are derived snapshots and renderer files. A workspace configuration normally lists `documents: ['*/lecture.json']`. Ordinary README Markdown is not a document entry.

```sh
presmium check lesson --json
presmium build lesson --to web
presmium build lesson --to slides
presmium serve .
presmium build .
```

Build a single relevant document/form during routine work. A workspace build publishes the workspace website; `presmium serve` is the editing service, with the security and network access described by its help.

Renderer settings belong in `metadata.renderers`, plugin document settings in `metadata.presmium`. Content scopes (`only`, `audience`) stay on their blocks; a student build must remove excluded content from outputs, not merely hide it in a page. Use `--audience student` only when the document declares that audience.

Translations reference JSON entries in `metadata.translations`; `translationOf` binds an original entry and digest. Preserve IDs and bindings when updating a translation, and report stale material rather than pretending it matches.

Use `presmium-present` for classroom delivery, offline distribution and narrated/video output. Never publish credentials or operator settings in document JSON.
