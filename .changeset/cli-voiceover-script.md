---
"@lincyaw/cli": patch
"@lincyaw/kernel": patch
"@lincyaw/compiler": patch
"@lincyaw/addon-lecture": patch
"@lincyaw/addon-speech": patch
"@lincyaw/skills": patch
---

Add `presmium voiceover` (report what generating a document's voiceover would do, generate the missing sentences in-process with `--yes`, set the default voice with `--voice`, delete unused speech cache with `--prune`), `presmium speech key set|clear|status` (the Volcengine speech key in the workspace's operator settings) and `presmium script export|import` (the narration as one Markdown file to polish and back).
