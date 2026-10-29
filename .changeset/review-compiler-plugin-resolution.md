---
"@lincyaw/compiler": patch
---

Bind cached environment executors to their provider so changing a document's plugins uses the selected implementation. Resolve Node plugin exports in their declared condition order, including nested conditions, arrays and subpath patterns, while preserving component-only packages and missing-entry diagnostics.
