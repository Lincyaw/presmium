---
"@lincyaw/web": patch
---

Reuse completed viewer and document bundles when concurrent preview processes install the same immutable build, avoiding spurious `ENOTEMPTY` failures.
