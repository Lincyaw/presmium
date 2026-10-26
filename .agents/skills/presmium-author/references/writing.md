# Writing and organizing content

Start with the teaching objective, the audience and the one thing each page should explain. Read the current `lecture.json` before changing it. Preserve object IDs so steps, comments and narration remain attached.

Write ordinary document content in typed text blocks. Use paragraphs, headings, lists, links, formulas, code and tables through the native editor or their rich-text JSON nodes. Pages are sections; their order is `sectionOrder`, not heading text parsing. Moving a page changes order and keeps its identity.

Keep the document readable without playback. Content blocks and narration are separate domain objects: changing a visible paragraph does not implicitly synthesize audio. When they should share wording, make the intended update explicitly and inspect affected narration/voice scope.

Put one teaching state in each step. State visibility and component state IDs must come from the document and definition contracts. For a reveal, bind explicit rich-text item IDs; do not infer identity from array positions. Narration order follows each step's `narrationIds`.

After an edit, inspect the complete document, including the final page. Then check the relevant preview: labels and code must be visible, steps reversible, and errors readable. Compile failures do not discard valid document edits. See [Document format](document.md) for the authority and [Publishing](publishing.md) for outputs.
