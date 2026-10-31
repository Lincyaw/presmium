---
'@lincyaw/workbench': patch
'@lincyaw/dsh': patch
'@lincyaw/kernel': patch
---

The workbench's assistant is told what the system is instead of what to do, and the author's comments reach it as the author's own words.

- `@lincyaw/kernel`: The preview protocol's `flash` command makes blocks (or sections) blink three times, the first brought into view; a reader who asks for less motion sees a steady tint instead. Pages list it among their capabilities.
- `@lincyaw/workbench`: When a turn of the AI's changes stands (waiting for the author's review, or accepted), the blocks it changed blink on the document, found from the review's diffs and the IR's source positions, once the preview shows that revision (`changedPlaces`).
- `@lincyaw/workbench`: Sent comments are quoted one by one with their place, the section's title and the passage as readers see them ("I left a comment on the document: …"), instead of an order to revise the document; a question in a comment is answered, not turned into an edit. Messages to the AI name no source file or line: the source ranges are in the agent's document context (comment N is the focus `comment-N`).
- `@lincyaw/dsh`:
  - The guide describes what is where (documents, entries, other files, paths relative to the workspace root, the workspace's own AGENTS.md), what the agent answers for (what the author asks and no more; the author reviews the changes) and what each tool tells (the preview recompiles on save, the diagnostics are the latest save's, the sandbox writes only inside the workspace).
  - The document context adds the entry's path, the forms, the plugins, the files of the document's directory and the workspace's other documents, and gives the focus with source paths relative to the workspace root. The author's position is taken once a turn, and browser feedback lists windows only when they report a failure or a live run, so the author's scrolling no longer sends the whole context again at every step.
  - The `创作` preset says who the author is (a teacher who may know no code and sees only the document) and how to speak to them: in the terms of what readers see, without files, paths, syntax, commands, tools, the sandbox or git. The presentation principles moved to the `presmium-author` skill, loaded when content is written; the preset no longer offers schedules, goals, subagents or file cards (`present`).
  - The conversation no longer shows the changed-files and delivery cards (`ui-deliverables` is off), nor tells the model to link every file its reply names: the author sees no files, and the changed blocks blink on the document instead.
