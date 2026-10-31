---
"@lincyaw/host": minor
"@lincyaw/addon-motion": patch
---

Resolve canonical state and parameters when using scene controls in the document reader. Local animation playback keeps its existing clock and no longer retains the final reading snapshot after jumping to an earlier animation step. Reader controls stay local to their scene instead of navigating to another document section, and keep their selected local state while the reader scrolls.
