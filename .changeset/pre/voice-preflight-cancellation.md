---
"@lincyaw/addon-lecture": patch
---

Recheck request cancellation after voice generation preflight completes, so an aborted request cannot enqueue an orphan job after its final source check.
