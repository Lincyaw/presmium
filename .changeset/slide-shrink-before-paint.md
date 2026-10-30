---
'@lincyaw/viewer': patch
---

Slides that shrink to fit no longer flash at full size when they appear: the shrink is applied before the slide is first painted, and again before paint whenever its content changes size.
