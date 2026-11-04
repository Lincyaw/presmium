---
"@lincyaw/addon-lecture": patch
"@lincyaw/skills": patch
---

`presmium-lecture timing <document> [--json]` prints, from the production plan the video export plays, each step's script characters, voiceover seconds, characters a second, animation and length, then the totals and the video's length. The lecture renderer option `metadata.renderers.lecture.maximumDurationMs` makes `presmium check` report a video that is longer, with how far it runs over and about how many characters of script to cut at the measured rate. `presmium-lecture export … --contact-sheet [<file.png>]` also writes one PNG of two labelled frames of every step, taken from the exported video with FFmpeg. A step whose visible blocks are all limited to other forms and that has nothing to say or play is no longer in the lecture video, its plan, captions or chapters.
