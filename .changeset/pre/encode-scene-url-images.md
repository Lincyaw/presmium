---
"@lincyaw/web": patch
"@lincyaw/skills": patch
---

Encode static scene images referenced through new URL(..., import.meta.url) with the shared WebP pipeline, reducing the images needed before narrated playback can start. Track these source images so edits invalidate cached scene bundles.
