---
"@lincyaw/presmium": patch
---

Resolve the selected desktop release tag to a full commit SHA when initializing the fixed update feed. Preserve already-published signed installers and resume only the publishing step after infrastructure initialization. Retry only transient macOS image-creation resource-busy errors without rebuilding the application, and exclude infrastructure release events from client builds.
