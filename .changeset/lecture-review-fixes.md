---
"@lincyaw/addon-lecture": patch
"@lincyaw/cli": patch
"@lincyaw/workbench": patch
"@lincyaw/design": patch
"@lincyaw/mcp": patch
"@lincyaw/skills": patch
---

Video Production loads while the author is on a page or step the lecture leaves out: the preview goes to the first step of the lecture after it (the last one before it at the end of the document), and the timeline of such a page says it is not in the lecture. A step that a `{cue}next` of an earlier narration moves into stays in the lecture, so the cues after it no longer land one step late. `presmium script` keeps an edited narration's line breaks and blank lines, and writes a `\`, `{`, `}`, `⟦` or `⟧` that is text (and a `|` inside a pronunciation) with a `\` before it, so that braces written in a narration are no longer read back as a pronunciation. `presmium check` reports, as a warning, when it could not check the lecture video's length against `maximumDurationMs`, and an animation on a step the lecture leaves out no longer makes the whole plan's timing unknown. Captions burned into an exported video scale with the frame, near its bottom edge, in near-black ink on a see-through light gray, and never take more than two lines: a longer caption is shown in pieces, one after another. `presmium-lecture export --contact-sheet` reads the video once for all its frames, labels them with libass (FFmpeg's `ass` filter) and works with FFmpeg before 5.1. `presmium mcp` documents `./tools` and `./call` for a document directory with those names.
