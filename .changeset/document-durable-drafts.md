---
"@lincyaw/workbench": patch
---

Back up unsaved body and caption input in strict IndexedDB transactions. Reopening offers explicit, isolated draft candidates; switching preserves the current snapshot, and old save or backup callbacks cannot clear newer input. Preserve legacy recovery material until migration commits and report backup read/write failures separately.
