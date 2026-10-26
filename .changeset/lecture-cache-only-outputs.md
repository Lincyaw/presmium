---
"@lincyaw/addon-lecture": patch
---

Make lecture checks, rendered outputs and video export consume only exact cached voiceover. Missing or stale clips now fail with localized guidance to generate voiceover explicitly, while existing valid clips are retained. Explicit confirmed synthesis and audition actions remain separate.
