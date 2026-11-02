---
"@lincyaw/kernel": patch
"@lincyaw/viewer": patch
"@lincyaw/workspace": patch
"@lincyaw/mcp": patch
---

`capture_slides` and `capture_overview` take `captions: false` to picture the whole slide without the captions drawn over it, and give each frame's narration as text; an overview also writes `narration.md` beside its pictures. A presentation opened with `?captions=off` starts with its captions off.
