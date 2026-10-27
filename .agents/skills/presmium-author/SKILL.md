---
name: presmium-author
description: "Create and edit a Presmium teaching document: the sole authoritative lecture.json, stable pages and rich-text blocks, steps, narration, assets and component definitions; validate, preview and publish it. 写讲义、改文稿、安排页面、正文、分步与讲稿、检查和构建时使用。"
---

# Authoring a Presmium document

A **document** is a folder containing `lecture.json`. This normalized, editable teaching document IR is the only content authority. The compiler derives a runtime snapshot for reading, slides, notebooks and narrated playback. Do not create `lecture.md`, `slides.md`, Markdown mirrors or a second BlockNote document file. Ordinary Markdown READMEs and code files remain ordinary project files.

A **workspace** has `presmium.workspace.yaml`; its `documents` patterns name JSON entries, normally `*/lecture.json`. A **lecture** means narrated playback, not the editable document. The studio is the browser editor started by `presmium studio` or `presmium-studio` when installed.

## Choose the work

| Author's task | Read |
|---|---|
| Write, organize or revise content | [Writing](references/writing.md), [Document format](references/document.md) |
| Show code, reference project files or run code | [Code](references/code.md) |
| Show something moving or explain a process | `presmium-animate` |
| Narration, voices, subtitles, recording or video | `presmium-present/references/lecture.md` |
| Build a site, a translation or student output | [Publishing](references/publishing.md) |
| Use the studio or ask an agent to change a document | [Assistance](references/assistance.md) |
| Implement a component or service | `presmium-develop` |

## Read and change the authority

1. Read `lecture.json`, workspace configuration and the referenced code/assets relevant to the request. Keep existing IDs when changing or moving an object.
2. Work with the domain entities: `sectionOrder` and `sections`, `blocks`, `steps`, `narrations`, `assets`, `definitions`, `production`. Entity map keys equal their `id` values. Page and child ordering are ID arrays.
3. Text is typed rich text with stable paragraph/list/table identities. Do not serialize it to Markdown for editing. Content has one parent; reuse a definition or asset instead of assigning one block to two parents.
4. Each section has at least one step. A step names visible block states and narration IDs. Component state IDs come from the definition's public states, never guessed numeric positions. Timing belongs only in `production`.
5. Keep unknown versioned component data intact. Report unsupported capability; never delete data to make a view look editable.
6. Validate with `presmium check <document>` and build only the form relevant to the request. In the studio, saving the document must succeed independently of snapshot compilation. A previous successful snapshot may be stale; check its document version.

## Commands

The default document starts with one empty page named from the supplied title.

```sh
presmium new lesson --type lecture --title 'Lesson'
presmium dev lesson
presmium check lesson --json
presmium build lesson --to web
presmium ir lesson --out runtime-snapshot.json
presmium studio .
```

Commands use `pnpm` and `presmium`; install the project dependencies with `pnpm install`. Never hand-edit `dist/` or derived runtime snapshot fields such as numeric `at`, `span`, step maps, published URLs or playback start times. The one-time repository migration is not an authoring or compatibility mode.
