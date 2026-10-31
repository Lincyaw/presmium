---
"@lincyaw/workbench": patch
---

Restore document page, stable step and viewport after reopening without taking text focus. Keep recovery and save retry actions reachable while scrolling, and report removed positions without binding them to a different step. Explicitly created documents can focus their first editable body after their source and native editor are ready; newer input, focus or navigation takes precedence.
