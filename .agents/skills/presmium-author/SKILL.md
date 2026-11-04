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

1. **Find the target.** `list_documents`; `get_focus` gives what the author has selected or pointed at, so "this page" or "this paragraph" means that.
2. **Read before writing.** `get_authoring_capabilities`, then `get_document_outline` for the pages and entities, then `read_document_part` for the complete values you will change. Read the surrounding pages too: a change must fit the document's claim and terms.
3. **Plan, then apply.** Page create, rename, move and delete: `plan_page_change`, `apply_page_change`. Content, steps and narration: `plan_document_change`, `apply_document_change`. Pass the source version you read; a 409 means the document changed, so read again and plan again rather than retrying. A write may wait for the author's approval in Presmium; a refusal is final for that request. `approval-unavailable` means no Presmium window is open to ask: tell the author to open Presmium Studio (or to start `presmium serve --allow operate`).
4. **Check.** `check_document`, then `get_diagnostics` for the full list. Fix what you caused; report what you can't fix in words the author understands.
5. **Look at the result.** `capture_slides` returns pictures of a changed page as the presentation shows it: the rest frame of every step, or with `at` moments (milliseconds) into a step's animation, and with `measure` (a CSS selector) the boxes of its elements in slide pixels; `capture_reading` returns the same page in the reading version at a window `width` (390 for a phone); `capture_overview` takes every page at once, for reviewing the whole document. Look at them for overflow, overlaps, what each step shows, the phone layout and the dark appearance before you report; a successful compile doesn't prove the page reads well or that its steps work. Don't script a browser for this.
6. **Voiceover and outputs are explicit.** Editing narration never generates audio. Read `get_voiceover_status`, tell the author the engine, the voice and the number of sentences (a cloud engine charges for them), and call `start_voiceover` only after the author agrees; without an MCP host, `presmium voiceover` gives the same report and generates with `--yes`. `build` and `get_builds` make and list outputs. Details in [Lecture production](references/lecture.md) and [Publishing](references/publishing.md).

Undo is `undo_document_change`; `get_document_history` lists the saved changes.

To connect an AI tool: a project made by `presmium new` has `.mcp.json` for Claude Code; otherwise run `claude mcp add presmium -- presmium mcp` or `codex mcp add presmium -- presmium mcp` in the project. `presmium mcp` relays to the Presmium Studio or `presmium serve` running for the project and follows it when it starts again (a `presmium dev` only previews: it has no author actions and takes no pictures); with neither running it only reads, checks and exports, and the author starts `presmium studio` then reconnects the server.

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
