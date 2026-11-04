---
name: presmium-author
description: "Write, edit, present and produce a Presmium teaching document: the sole lecture.json with its pages, blocks, steps and narration; its reading version (web page, notebook) and presentation version (slides, narrated lecture video); writing style for both; voiceover, captions, classroom, export and publishing. Use it to write or revise a lecture, plan pages, write slide text or narration, check, preview, present, record, generate voiceover or export. 写讲义、改文稿、写正文与幻灯片文字、写讲稿、配音、字幕、放映、上课、导出、发布时使用。"
---

# Authoring a Presmium document

A **document** is a folder containing `lecture.json`: the only editable source of a teaching document. Everything readers see is derived from it by the compiler: the **reading version** (the web page, and a notebook when listed) and the **presentation version** (the slides, and the narrated **lecture** video made from the slides and the narration). Don't create `lecture.md`, `slides.md` or any second copy of the content.

A **workspace** has `presmium.workspace.yaml`; its `documents` patterns name the documents, normally `*/lecture.json`. The **studio** is the browser editor started by `presmium studio`.

Terms used throughout:

| Term | Meaning |
|---|---|
| Page | A section of the document; pages are ordered by `sectionOrder` |
| Block | One piece of content on a page: `text`, `image`, `code`, `component` (an animation or interactive part) or `container` |
| Step | One state of a page: which blocks are visible, which state each component shows, which narration is spoken. Slides advance step by step |
| Narration | The spoken script of a step: heard in the lecture video, shown to the presenter, never on the reading page |
| Form | What the document is built into, by renderer id: `web` (reading page), `notebook`, `slides` (presentation), `lecture` (narrated video from the slides). `metadata.renderers` lists the forms a document builds; a new document lists all four |
| Presenter View | The presenter's window while presenting slides: current and next slide, the narration as notes |

## Choose the work

| The author asks to | Read |
|---|---|
| Write a lecture, revise text, plan pages, write slide text or narration | [Writing](references/writing.md) first, then [Document format](references/document.md) |
| Show code, reference project files or run code | [Code](references/code.md) |
| Show something moving or explain a process | `presmium-animate` |
| Make one large piece with several agents in parallel | `presmium-animate/references/team.md` |
| Generate voiceover, choose voices, set captions, record or make the video | [Lecture production](references/lecture.md) |
| Build a site, slides, PDF, PowerPoint, notebook, translation or student version; prepare offline | [Publishing](references/publishing.md) |
| Write or restyle a site's homepage (`site/home.json`), choose its theme | [Publishing, Write the homepage](references/publishing.md#write-the-homepage) |
| Run a class with quizzes, polls and students following along | [Classroom](references/classroom.md) |
| Details of every studio and MCP action: conflicts, approvals, audio and image import, transcription | [Assistance](references/assistance.md) |
| Implement a component or service | `presmium-develop` |

## Writing in one paragraph

Each page has one idea and two versions. The reading version is written like a book: formal written language, Chinese in Chinese word order and English in English word order, every sentence carrying information. The presentation version shows a claim as its heading, keywords and pictures, and moves with steps; its explanation is the narration, a separate spoken script rather than the reading text read aloud. Both use one name per concept throughout, and formal words of the audience's field (its own terms, not calques) in titles, labels and narration; a concept is shown before it is named and used, and its first mention defines it. Neither version defends against a reading nobody would make. Shared figures, animations and code are written once; reading paragraphs are limited to `["web", "notebook"]` (or `["web"]` when the document doesn't build a notebook), slide keywords to `["slides", "lecture"]`. [Writing](references/writing.md) has the rules and the review.

## Work through the tools

When the MCP server `presmium` offers author actions (the studio's assistant; or `presmium mcp` while Presmium Studio or `presmium serve` runs for the project, which a new project's `.mcp.json` connects Claude Code to), change the document through them, the same actions the studio's buttons use. The server's instructions list this order too; each tool describes its own parameters.

1. **Find the target.** `get_context` gives the current saved page, step, narration and actually reported selection. When no editor is connected or several targets are possible, name the document/page explicitly; `list_documents` lists documents. Pending editor state is not saved draft content.
2. **Read the context the edit needs.** An explicit title change goes straight to `rename_page` with `section` (page number from 1, or stable ID) and `title`. For content, use `get_document_outline` and `read_document_part` for the complete values you will change and the relevant surrounding pages. An advertised tool does not require a separate capability request. The external MCP catalog is compact. Find additional actions with `operations`, inspect one by name for generated argument summaries, and request `schema:true` only for a complete input definition. Dispatch through the matching read/edit/spend/write/agent operation tool. CLI `presmium mcp tools <tool>` returns a summary, `--schema` the complete input schema and `tools --all --json` the full catalog.
3. **Save in one call.** Use `rename_page` for a title, `edit_narration` for a unique exact phrase replacement or deletion, and the discovered `edit_document` operation for canonical operations on text, blocks, steps, narration, timing and assets. Narration edits default to the current editor page/step; missing or ambiguous original text is refused. Comments, voice, caption scale and component parameters also have generated one-call actions such as `comment_create`, `voice_set` and `caption_scale_set`. The server reads the current source, preflights, saves and verifies the saved source internally; no separate plan/apply/readback requests are needed. Pass optional `source` when the intent depends on a prior read. A 409 requires a fresh read and an explicit decision, never an automatic retry. The owner's MCP credential already authorizes canonical document editing; execution and paid generation keep their confirmation policies. A simple edit returns saved/changed and editor status; request details only for diagnostics. Versions, hashes, plans and source readback stay on the server for ordinary edits. Plan/apply tools remain for complex reviewed changes, page creation/move/deletion and duplication; deletion retains explicit confirmation. A refused approval is final for that request.
4. **Use the returned evidence.** For a simple edit, report its saved value and editor feedback; do not run whole-document checks or captures by default. Run `check_document` and `get_diagnostics` for code or structural changes, reported failures, or when requested. Fix what you caused; report what you cannot fix. Pending or unavailable editor feedback does not invalidate a successful save or justify repeating the write.
5. **Inspect appearance when the task needs it.** For layout and animation work, `capture_slides` returns the changed page at rest, with `at` for animation moments and `measure` for element boxes. `capture_reading` checks reading layout and phone width; `capture_overview` reviews a deck. Capture only the affected scope. Saved source and reported editor synchronization do not prove visual layout or playback. Don't script a browser for this.
6. **Voiceover and outputs are explicit.** Editing narration never generates audio. Read `get_voiceover_status`, tell the author the engine, the voice and the number of sentences (a cloud engine charges for them), and call `start_voiceover` only after the author agrees; without an MCP host, `presmium voiceover` gives the same report and generates with `--yes`. `build` and `get_builds` make and list outputs. Details in [Lecture production](references/lecture.md) and [Publishing](references/publishing.md).

Discover `undo_document_change` for saved history and `get_document_history` for its entries. `editor_action` controls advertised browser actions, supplying connection/revision/source metadata internally and waiting briefly for a real acknowledgement. Pending returns a request reference to inspect; never resend an action merely because its acknowledgement was lost. Native unsaved editor history remains a separate browser capability.

To connect an AI tool: a project made by `presmium new` has `.mcp.json` for Claude Code; otherwise run `claude mcp add presmium -- presmium mcp` or `codex mcp add presmium -- presmium mcp` in the project. `presmium mcp` relays to the Presmium Studio or `presmium serve` running for the project and follows it when it starts again (a `presmium dev` only previews: it has no author actions and takes no pictures); with neither running it only reads, checks and exports, and the author starts `presmium studio` then reconnects the server. A script or pipeline without an MCP client calls the same tools of the running service from the project's directory: `presmium mcp tools` lists them, `presmium mcp call <tool> '<JSON arguments>'` prints the result as JSON, and `--out <dir>` saves the pictures a capture returns as PNG files.

Without an MCP host that has author actions (working on files in a project), edit `lecture.json` directly and use the command line:

```sh
presmium new lesson --type lecture --title 'Lesson'
presmium check lesson --json
presmium dev lesson
presmium build lesson --to web
presmium build lesson --to slides
presmium ir lesson --out runtime-snapshot.json
presmium script export lesson
presmium script import lesson
presmium voiceover lesson
presmium voiceover lesson --yes --prune
presmium speech key status .
presmium studio .
```

Commands use `pnpm` and `presmium`; `pnpm add -g @lincyaw/presmium` includes Studio, renderers and official plugins. The global command uses its installed version; use `pnpm exec presmium` to choose the project version. Install project dependencies with `pnpm install`. `presmium script export lesson` writes the narration as one file to polish (`lesson/dist/script.md`); `presmium script import lesson` writes the edited paragraphs back. `presmium voiceover lesson` only reports what generating the voiceover would do (voice service, voice, sentences and characters without audio; a cloud service charges by the character); tell the author, and run it again with `--yes` only after they agree. It generates in the command's own process through the same execution as the studio's Video Production, so no studio or `presmium serve` needs to run; the speech key comes from the workspace's operator directory (`presmium speech key set`). With the voiceover generated, `presmium-lecture export lesson` writes the video ([Lecture production](references/lecture.md)).

## Rules for the source

1. Work with the document's entities: `sectionOrder` and `sections` (pages), `blocks`, `steps`, `narrations`, `assets`, `definitions`, `production`. Map keys equal their `id`. Page order and child order are ID arrays.
2. Keep IDs when changing or moving anything: comments, steps, narration and translations stay attached through them.
3. Text is typed rich text with stable paragraph, list and table IDs, never Markdown in a string. A block has one parent; reuse a definition or an asset instead of giving one block two parents.
4. Each page has at least one step. A step names the visible blocks, the component states and the narration IDs; a component's state names are the ones its definition declares, never guessed positions. Timing and voices belong only in `production`.
5. Keep unknown versioned component data intact. Report an unsupported capability; never delete data to make a view editable.
6. Never hand-edit `dist/` or derived snapshot fields (numeric `at`, `span`, step maps, published URLs, playback times). A failed compile doesn't undo a valid saved edit, and a previous successful preview may be stale: check which version it shows.
7. Voices and engines come from the workspace's speech service; never invent a voice catalogue or claim an option works without checking. Operator credentials and endpoints stay outside the document.
8. Check the real output: visible text, captions, step navigation and audio. Report what was run and what was not.
