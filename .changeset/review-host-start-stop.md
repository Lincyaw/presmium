---
"@lincyaw/host": patch
---

Serialize host startup and shutdown so restarting waits for the previous plugins to finish disposing, and keep each step clock's preparation tasks and failures within its own runtime.
