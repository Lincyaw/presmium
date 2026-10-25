---
name: presmium-author
description: "Help a user turn material into a Presmium document (MyST Markdown built into a web page, slides, a notebook and a narrated lecture) that reads well and presents as intended; edit an existing document; arrange on-screen content, narration and reveal steps; reference or run code; fix check and build problems; publish a student version, a translation or a course site; edit in the studio or with an agent. Use when creating or editing a Presmium document (a folder with lecture.md) or workspace. 写讲义、改文稿、安排讲解与分步、引用或运行代码、修复检查与构建问题、发布学生版或译本时使用。"
---

# Writing and editing Presmium documents

Start from what the user wants to make clear, and deliver a document that reads well and presents as intended. First work out what the reader will see and how the presenter needs to move through it, then choose the syntax and plugins.

For animations and step-by-step visual explanation (making an animation, choosing how to show a teaching moment, syncing an animation with the narration) use the presmium-animate skill. It covers scenes (animations written in code, `scenes/<name>.ts`, placed with the `{scene}` directive) and carries a gallery of scenes you can adapt directly.

## Terms

- **Document**: what an author writes and builds: a folder with an entry file, by default `lecture.md`, plus the files it uses (`scenes/`, `components/`, images and other media). A folder can hold a second entry file, such as `slides.md`.
- **Workspace**: a folder with `presmium.workspace.yaml` that holds several documents and builds them into one site (a course).
- **Section**: the part of a document under one `##` heading; one slide when presented. `#` headings group sections into chapters.
- **Block**: one piece of content in a section (a paragraph, code block, image, table, formula, directive).
- **On-screen content** and **narration**: on-screen content is the blocks shown on the slide; narration is the plain paragraphs, which become the speaker notes and what a narrated lecture says.
- **Step**: a position inside a section when presenting; pressing next moves one step.
- **Form**: what a document is built into: the web page (`web`), the slides (`slides`), the notebook (`notebook`), the narrated lecture (`lecture`). The frontmatter's `renderers` key and the `--to` option take these ids.
- **Lecture**: only the narrated playback: the narration synthesized or recorded and played over the presentation, and its video export.
- **Directive**: a MyST block written ```` ```{name} ```` or `:::{name}`; a **role** is inline: ``{name}`text` ``.
- **Plugin**: an npm package listed under `plugins` in the document's frontmatter that adds directives, components and checks.
- **Studio**: the browser workbench started by `presmium studio`, for authors who do not edit source.

Every `presmium` command takes a `[deck]` argument: the document folder or an entry file, default the current folder. For example `presmium build slides.md --to slides` builds the second entry file of the current folder.

## Find the entry point for this task

| The user wants to | Settle first | Read |
|---|---|---|
| Write a document from material | Who it is for, what they can understand or do afterwards, which forms to deliver | [Sections, steps and narration](references/writing.md) |
| Change an existing document | The sections involved, the existing conventions, the reading or presenting effect to change | [Sections, steps and narration](references/writing.md) |
| Reference code, let readers run code | Where the code comes from, when it runs, whether blocks share variables | [Code references and execution](references/code.md) |
| Publish to students, add a translation, build a course site | What is public, which languages, the final address | [Publishing and reproduction](references/publishing.md) |
| Investigate an error, a failed build, output that looks wrong | The first relevant diagnostic and its location, the form that is wrong | "Fixing problems" below; the syntax in the [directive reference](references/directives.md) |
| Edit in the browser or in VS Code | The document or workspace folder, the scope of the change | "Choosing how to edit" below |
| Have an agent read or change the document, or add an AI question box for readers | Whether the author is editing or a reader is asking while reading | [Editing and questions with AI](references/assistance.md) |

Read only the references the current task needs. The directive reference answers "how to write it"; this skill decides "what to choose and how far to go".

## Pick up an existing document first

Before changing anything, read the frontmatter of the entry file, the sections involved and the files they include. Keep the existing language (`lang`), plugins, labels (the `(name)=` lines that give sections and blocks stable ids) and layout.

Infer the audience, the goal and the forms to deliver from the material and the existing content. Ask only for information that would change what goes in and cannot be inferred; do not turn configuration options into a questionnaire.

## Start a new document

A new project needs Node.js 22.19 or later and pnpm. Install the command once with `pnpm add -g @lincyaw/presmium`, then:

```sh
presmium new my-lecture --type lecture --title "Introduction to tokenization"
cd my-lecture
presmium dev --to web
```

`presmium dev` prints the address of the preview. For a course of several documents, make a workspace with `presmium new my-course --type workspace`. Install a project's dependencies with `pnpm install`; when the project has its own `@lincyaw/presmium`, the global `presmium` hands over to that version. In instructions for users, write commands with pnpm and `presmium` only.

## Writing for an audience: the launch-event principle

When creating or rewriting content for an audience (documents, slides, articles and other presentation material), write it the way a product launch is written: organize the content around the core point and its value to the audience, and adapt the expression to each form. When the author asks for one change only, write that one change by these principles and do not use it as an occasion to change anything else.

**Top priority: the information principle**

Every sentence must have a clear reason to exist and do concrete work for the audience's understanding, judgment or action. Every slide, screen or independent block must carry real information and have a clear explanatory or argumentative job. Sentences, notes, examples, data and repetitions all need a clear purpose; delete anything whose removal does not affect the audience's understanding or judgment. Narrative arrangement, layout variation and language polish all serve this principle; never add content without substance to satisfy a form.

1. Build the narrative around the most valuable and most convincing point or advantage, so that all content supports the core claim.
2. Order the content by how the audience comes to understand the problem; do not list your own thinking, work process or attempts in the order they happened.
3. Avoid self-undermining phrases such as "just a few humble thoughts" or "this may not be worth much"; never belittle the content.
4. Choose the angle, criteria and basis of comparison by the content's purpose and the audience's needs, and concentrate on what fully demonstrates the core value.
5. When different views, methods or results come up, explain the differences through their goals, conditions of use and reasonable trade-offs rather than ranking them simply.
6. State explicitly why the core point matters, what supports it, and what it helps the audience understand or solve; do not leave the audience to infer the value from text, tables or figures.
7. In material laid out as slides, screens or blocks, the same layout must not appear consecutively, and no layout may repeat within any five consecutive slides, screens or major blocks.
8. When a layout repeats, reorganize the information by the relationships in the content, choosing a fitting process, comparison, timeline, chart or text-and-image presentation; do not keep the same layout by changing colors, icons or wording. The layouts available are in [Sections, steps and narration](references/writing.md), "When a slide is too full".
9. On slides with too much text, prefer a graphic form: depending on the relationships, use a flowchart, relationship diagram, timeline, data chart or text-and-image combination, cutting continuous text while keeping the necessary information. Graphics must carry information and show relationships; do not paste whole paragraphs into shapes.
10. Open early with the question the audience cares about, the key issue worth discussing, the core point and the strongest evidence.
11. Close by reinforcing the core point and what is most worth remembering; do not suddenly change position or add self-negating judgments.

## Write and verify together

Organize sections around the reader's questions. Narration supplies the reasoning, assumptions and examples; on-screen content keeps the evidence needed at the current step. Plain paragraphs and plain lists are narration (speaker notes on the slides); wrap what must be on the slide in `:::{slide}`. Both kinds appear on the web page. The full rules, including which step each paragraph of narration belongs to, are in [Sections, steps and narration](references/writing.md).

When content is revealed step by step, write the on-screen blocks and their narration in the order the presenter goes through them. Give a label (`(name)=` on the line before the heading or block) to every section and block that links, class notes or recorded lectures refer to; generated ids change when content is inserted.

The web page reads the sections one after another. Do not add a heading only to force a new slide. When the same content also needs slides arranged differently from the web page, write a second entry file in the document folder (such as `slides.md`) and build it with `presmium build slides.md --to slides`; a paragraph that appears in both entry files must be changed in both.

Check, then look:

1. Run `presmium check` in the document folder and fix the diagnostics that concern this change.
2. Look at the web page with `presmium dev --to web`. When slides are needed, preview them too (`presmium dev --to slides`): text is on the slide, the font size is readable, nothing overflows, and the steps work going forward and backward.
3. Only when the number of steps or the step a paragraph belongs to is unclear, use `presmium ir` as described in [Sections, steps and narration](references/writing.md), "Check the steps".

Build the agreed forms, for example `presmium build --to web,slides` (output in `dist/`). Read the diagnostics the build prints for content that was not rendered or was degraded. After a successful build, still open the output and confirm that what the user needs is there: images, links, run results and interactive components are all part of the content.

## Fixing problems

First reproduce the command and form the user used, then follow the file and line in the diagnostic to the source. Fix the first cause that leads to later errors.

| Symptom | Next step |
|---|---|
| `unknown directive`, `unknown option` | Check the syntax and the plugin that provides it in the [directive reference](references/directives.md); confirm the frontmatter's `plugins` lists that plugin |
| Text missing from the slides, speaker notes on the wrong step | Read [Sections, steps and narration](references/writing.md); check which blocks are narration and which are on-screen content |
| Code anchor lost, wrong path, output not updated | Read [Code references and execution](references/code.md); check the repository root path, the pinned commit and the recorded output |
| Link, student version or translation check fails | Read [Publishing and reproduction](references/publishing.md); check the output folder and the translation's digest |

Do not hide content, disable checks or delete caches instead of locating the problem. Update the anchor lock (`presmium check --update-lock`, see [Code references and execution](references/code.md)) only after confirming the new location of the referenced code; update a translation's digest (see [Publishing and reproduction](references/publishing.md)) only after confirming the translation has caught up with the original.

## Choosing how to edit

- **The user already has an editor**: edit the MyST source directly; `presmium dev` updates the preview on save. `presmium dev` previews one document; `presmium serve` serves a workspace. Both show the full content; to share with students, build the student version, see [Publishing and reproduction](references/publishing.md).
- **VS Code**: download the extension's `.vsix` for the system and processor from https://github.com/Lincyaw/presmium/releases and install it with "Extensions: Install from VSIX…". Open the document and run "Presmium: Open Preview to the Side"; the preview updates on save and follows the section under the cursor. It needs Node.js 22.19 or later and the document's own plugin dependencies, not the studio or a model.
- **The studio**: for an author who does not want to see source. Install it with `pnpm add -g @lincyaw/studio` and open it with `presmium-studio <folder>`; for an install inside the project use `pnpm add -D @lincyaw/studio` and `pnpm exec presmium studio <folder>`. The folder is a document or a workspace. Open the full address printed in the terminal; `Ctrl+C` stops it. Editing, saving and previewing work without a model; the AI assistant needs a model set up in the studio's settings.

### What the author sees in the studio

The studio shows the document exactly as the reader sees the web page or the slides; it shows no source and no files. To change the source directly, use an editor or the VS Code extension.

- **Editing**: in edit mode, click a block or select text and a toolbar appears: **Edit text**, **New Comment**, **Rewrite with AI**. Double-click text to change it directly; Enter saves, Esc cancels. When formatted text (links, math and the like) cannot be edited directly, the studio offers to hand it to the AI to rewrite. In view mode the document looks as the reader sees it.
- **Versions**: every change is saved automatically as a version (a commit in a git repository), and each round of AI changes is one version. Changed paragraphs flash briefly in the document; the chat does not list files. Undo (Ctrl+Z) and Redo (Ctrl+Y) step back and forward, and **Version History** lists every change, each of which can be undone or redone on its own. When the workspace requires review (in `presmium.workspace.yaml`: `settings:` → `presmium.assistant:` → `review: required`), the author accepts or rejects each round of AI changes first.
- **Comments**: comments are notes from the author to the AI, questions or change requests. The author writes them one by one where they apply, then clicks **Send N comments to AI** in the command bar to send them together. The AI answers the questions and makes the requested changes, and the changes become one version. The **Comments** pane lists all comments, which can also be sent one at a time.
- **Problems**: when content does not display correctly, the top of the page says how many places are affected and offers **Fix with AI**.
- **Chat**: **AI assistant** on the right of the app bar (the top bar) opens or hides the chat; it can also be hidden from its own top, and unsent text is kept. **New chat** at the top of the chat starts a new discussion without closing the document; **Chat history** next to it lists earlier sessions, and choosing one shows its conversation. A link to the document's source in a chat message marks that place in the document.
- **Bars**: **More** on the right of the app bar, next to Settings, opens plugins and automated tasks. Clicking the document title in the app bar's path returns to the document; edit drafts are kept. The document's command bar has the **Navigation Pane** (the list of sections or slides), Undo and Redo, view, mode, comments and **Version History**. The status bar at the bottom shows the current section or slide and the word count.
- **Narrow windows**: opening a side pane such as the history hides the chat so it does not cover the document; switch back to the chat from the activity bar, and drafts are kept. Side panes can be shown full screen and return to the split view when closed.

The labels follow the interface language. In Chinese they are 编辑文字 (Edit text), 新建批注 (New Comment), AI 改写 (Rewrite with AI), 版本历史 (Version History), 发送 N 条批注给 AI (Send N comments to AI), 批注 (Comments), 让 AI 修复 (Fix with AI), 新建对话 (New chat), 对话记录 (Chat history), AI 助手 (AI assistant), 更多 (More), 导航窗格 (Navigation Pane).

### When you are the AI in the studio

Each turn starts with a `<presmium-document>` context: the document the author has open, its sections, its current diagnostics, where the author is and what they point at. When you save a file, the author's open preview updates by itself, and the diagnostics in that context are those of the latest save. Confirm a text change with those diagnostics and with `presmium__get_section` (the compiled text and steps of a section). Do not build unless the author asked for output files. The other tools are in [Editing and questions with AI](references/assistance.md).

## Handing over to the user

Say where the content was changed, how to preview it or open the output, which checks actually ran, and the limitations that still affect use. When the user has to take over, give a next step they can carry out.

In the studio the author is a teacher who may not know code: describe things as the author sees them (which section, which paragraph, which sentence, what the reader sees now), and do not mention file names, paths, line numbers, syntax, directives, commands, builds, sandboxes or git. When something cannot be done, say in plain words what the author cannot get for now and what they can do instead.

Live presentation, the classroom, offline preparation, PDF export and lecture playback are in the presmium-present skill. Use the presmium-develop skill only when the existing directives really cannot do the task and a component or plugin must be developed.
