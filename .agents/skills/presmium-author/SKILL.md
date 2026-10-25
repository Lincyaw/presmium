---
name: presmium-author
description: "Help a user turn material into a Presmium lecture that reads well and presents as intended, edit an existing MyST lecture, fix check and build problems, and publish a student version or a translation. Use when creating or editing a Presmium lecture, arranging narration and reveal steps, referencing or running code, or preparing document builds. 写讲义、改文稿、安排讲解与分步、引用或运行代码、修复检查与构建问题、发布学生版或译本时使用。"
---

# Writing and editing lectures

Start from what the user wants to make clear, and deliver a lecture that reads well and presents as intended. First work out what the reader will see and how the presenter needs to move through it, then choose the syntax and plugins.

For animation and step-by-step explanation (making an animation, choosing how to show a teaching moment, syncing an animation with the narration) use the presmium-animate skill: it carries its own gallery, one lecture per animation library, with scene files you can adapt directly.

## Find the entry point for this task

| The user wants to | Settle first | Read as needed |
|---|---|---|
| Write a lecture from material | Who it is for, what they can understand or do afterwards, which deliverables | [Organizing content and steps](references/writing.md) |
| Change an existing lecture | The sections involved, the existing conventions, the reading or presenting effect to change | [Organizing content and steps](references/writing.md) |
| Reference code, let readers run code | Where the code comes from, when it runs, whether blocks share variables | [Code references and execution](references/code.md) |
| Publish to students, add a translation, build a course site | What is public, which languages, the final address | [Publishing and reproduction](references/publishing.md) |
| Investigate an error, a failed build, output that looks wrong | The first relevant diagnostic and its location, the form that is wrong | "Fixing problems" below; syntax in the [directive reference](references/directives.md) |
| Edit in the browser, have an agent change the lecture | The lecture or workspace directory, the scope of the change | "Choosing how to edit" below |
| Let an external agent read the lecture, add AI questions for readers | Whether it is the author editing or a reader asking while reading | [Editing and questions with AI](references/assistance.md) |

Read only the references the current task needs. The directive reference answers "how to write it"; this skill decides "what to choose and how far to go".

## Pick up the existing lecture first

Before changing anything, read the frontmatter of the entry `lecture.md`, the relevant sections and the files they include; keep the existing language, plugins, labels and layout. A lecture can use another entry file name; commands accept a directory or an entry file.

Infer the audience, goal and deliverables from the material and the existing content. Ask only for information that would change what goes in and cannot be inferred; do not turn configuration options into a questionnaire.

A new project needs Node.js 22.19 or later and pnpm. After `pnpm add -g @lincyaw/presmium`:

```sh
presmium new my-lecture --type lecture --title "Introduction to tokenization"
cd my-lecture
presmium dev --to web
```

For a course of several documents use `presmium new my-course --type workspace`. Install a project's dependencies with `pnpm install`; the global `presmium` hands over to the version installed in the project. In instructions for users, write commands with pnpm and `presmium` only.

## Writing for an audience: the launch-event principle

When creating or rewriting content for an audience (lectures, slides, documents, articles and other presentation material), follow the launch-event principle: organize the content around the core point and its value to the audience, and adapt the expression to the medium. When the author asks for one change only, write that one change by these principles and do not use it as an occasion to change anything else.

**Top priority: the information principle**

Every sentence must have a clear reason to exist and do concrete work for the audience's understanding, judgment or action. Every page, screen or independent content block must carry real information and have a clear explanatory or argumentative job. Sentences, notes, examples, data and repetitions all need a clear purpose; delete anything whose removal does not affect the audience's understanding or judgment. Narrative arrangement, layout variation and language polish all serve this principle; never add content without substance to satisfy a form.

1. Build the narrative around the most valuable and most convincing point or advantage, so that all content supports the core claim.
2. Order the content by how the audience comes to understand the problem; do not list your own thinking, work process or attempts in the order they happened.
3. Avoid self-undermining phrases such as "just a few humble thoughts" or "this may not be worth much"; never belittle the content.
4. Choose the angle, criteria and basis of comparison by the content's purpose and the audience's needs, and concentrate on what fully demonstrates the core value.
5. When different views, methods or results come up, explain the differences through their goals, conditions of use and reasonable trade-offs rather than ranking them simply.
6. State explicitly why the core point matters, what supports it, and what it helps the audience understand or solve; do not leave the audience to infer the value from text, tables or figures.
7. In material laid out as pages, screens or blocks, the same layout must not appear consecutively, and no layout may repeat within any five consecutive pages, screens or major blocks.
8. When a layout repeats, reorganize the information by the relationships in the content, choosing a fitting process, comparison, timeline, chart or text-and-image presentation; do not keep the same layout by changing colors, icons or wording.
9. On slides with too much text, prefer a graphic form: depending on the relationships, use a flowchart, relationship diagram, timeline, data chart or text-and-image combination, cutting continuous text while keeping the necessary information. Graphics must carry information and show relationships; do not paste whole paragraphs into shapes.
10. Open early with the question the audience cares about, the key issue worth discussing, the core point and the strongest evidence.
11. Close by reinforcing the core point and what is most worth remembering; do not suddenly change position or add self-negating judgments.

## Write and verify together

Organize sections around the reader's questions. Narration supplies the reasoning, assumptions and examples; projected content keeps the evidence needed at the current step. Plain paragraphs become the slides' speaker notes by default; wrap text that should be projected in `{slide}`. Both appear on the web page.

When content is revealed step by step, arrange the projected content and the following narration in the presenter's order. Give explicit labels to sections and blocks that links, class notes or lecture recordings will refer to; generated block IDs change when content is inserted.

A document reads continuously by topic; do not turn each output or slide break into a repeated heading. When the same content also needs a separately arranged PPT, write a second entry in the lecture directory (such as `slides.md`) and build it with `presmium build slides.md --to slides`; the same paragraph in both entries must be changed together.

Run `presmium check` in the lecture directory and fix the diagnostics related to this change. Look at the reading view with `presmium dev --to web`; when slides are needed, preview them too and check that text is on screen, font size and overflow, and the steps going forward and backward. Only when the step count or the step a note belongs to is unclear, use `presmium ir` to check the blocks' `at` and `span` and the section's `steps`.

Build the agreed deliverables, for example `presmium build --to web,slides`. Read the report for content that was not rendered or was degraded; after a successful build, still confirm that what the user needs appears in the output. Images, links, run results and interactive components are all part of the content.

When the AI edits in the workbench, the preview the author has open updates after saving, and the diagnostics in the lecture context are the check results of the latest save; confirm text changes with the diagnostics and `presmium__get_section`, and do not build unless the author asked for output.

## Fixing problems

First reproduce the command and form the user used, then follow the file and line in the diagnostic to the source. Fix the first cause that leads to later errors.

| Symptom | Next step |
|---|---|
| `unknown directive`, `unknown option` | Check the syntax and the providing plugin in the [directive reference](references/directives.md); confirm the frontmatter's `plugins` lists it |
| Text missing from slides, notes not matching steps | Read [Organizing content and steps](references/writing.md) and check the roles of narration and projected content |
| Code anchor lost, wrong path, output not updated | Read [Code references and execution](references/code.md); check the repository root path, the pinned version and the cache |
| Link, student version or translation check fails | Read [Publishing and reproduction](references/publishing.md); check the delivery directory and the matching version |

Do not hide content, disable checks or delete caches instead of locating the problem. Update the anchor lock only after confirming the new location of the referenced code; update a translation's digest only after confirming the translation has caught up with the original.

## Choosing how to edit

To edit in VS Code, download the `.vsix` for the system and processor from the GitHub releases page and install it with "Extensions: Install from VSIX…". Open the lecture and run "Presmium: Open Preview to the Side"; it updates on save and follows the section under the cursor. It needs Node.js 22.19 or later and the lecture's own plugin dependencies, not the workbench or a model. The releases page lists the packages for each system and processor: https://github.com/Lincyaw/presmium/releases.

When the user already has an editor, edit the source directly. To edit in the browser, install `pnpm add -g @lincyaw/studio` and open the workbench with `presmium-studio <directory>`; for a project-local install use `pnpm add -D @lincyaw/studio` and `pnpm exec presmium studio <directory>`. Open the full address printed in the terminal; `Ctrl+C` stops it. Editing, saving and previewing work without a model.

A lecture opened in the workbench looks exactly like the web page or slides the reader sees. In edit mode, click a block or select text and a toolbar appears: **Edit text**, **New Comment**, **Rewrite with AI**. Double-click text to change it directly; Enter saves, Esc cancels. When formatted text (links, math and the like) cannot be edited directly, the workbench offers to hand it to the AI to rewrite. In view mode the lecture looks as the reader sees it.

Every change is saved automatically as a version (a commit in a git repository), and each round of AI changes is also a version (when the workspace sets `review: required`, the author accepts or rejects it first). Changed paragraphs flash briefly in the lecture; the chat does not list files. Undo (Ctrl+Z) and Redo (Ctrl+Y) in the top bar step back and forward, and **Version History** lists every change, each of which can be undone on its own. Comments are notes from the author to the AI, either questions or change requests: write them one by one where they apply, then click **Send N comments to AI** in the top bar to send them together. The AI does what the comments say: it answers questions and makes requested changes, and the changes become one version. The **Comments** pane lists all comments, which can also be sent one at a time. When content does not display correctly, the top of the page says how many places are affected and offers **Fix with AI**.

To change the source directly, use your own editor or the VS Code extension; the workbench shows no source or files. A link to the lecture source in the chat marks that place in the lecture.

Click **New chat** at the top of the chat pane to start a new discussion; **Chat history** next to it opens earlier sessions. Starting a new chat does not require switching to the left side and does not close the current lecture.

**AI assistant** on the right of the app bar opens or hides the chat; choosing a session in **Chat history** shows its conversation directly. The chat can be hidden from its top; unsent text is kept.

Plugins and automated tasks open from **More** on the right of the app bar, next to Settings. Click the lecture title in the app bar's path to return to the lecture; edit drafts are kept.

The lecture's command bar has the **Navigation Pane** (list of sections or slides), Undo and Redo, view, mode, comments and **Version History**; the version history lists each change, which can be undone or redone on its own, and AI changes wait for you to accept or reject them. The status bar at the bottom shows the current section or slide and the word count.

In a narrow window, opening history or files hides the chat so it does not cover the lecture; switch back to the chat from the activity bar, and drafts are kept. Side panels can also be shown full screen and return to the split view when closed.

The workbench labels follow the interface language; in Chinese they are 编辑文字, 新建批注, AI 改写, 版本历史, 发送 N 条批注给 AI, 批注, 让 AI 修复, 新建对话, 对话记录, AI 助手, 更多, 导航窗格.

`presmium dev` previews one lecture; `presmium serve` previews a workspace; both serve the full lecture. To share with students, build the student version explicitly, see [Publishing and reproduction](references/publishing.md).

## Handing over to the user

Say where the content was changed, how to preview it or open the output, which checks actually ran, and the limitations that still affect use. When the user has to take over, give an executable next step.

In the workbench the author is a teacher who may not know code: describe things as the author sees them (which section, which paragraph, which sentence, what the reader sees now), and do not mention file names, paths, line numbers, syntax, directives, commands, builds, sandboxes or git. When something cannot be done, say in plain words what the author cannot get for now and what they can do instead.

Live presentation, the classroom, offline preparation, PDF and lecture playback use `presmium-present`; use `presmium-develop` only when the existing syntax really cannot do the task and a component or plugin must be developed.
