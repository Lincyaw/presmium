---
"@lincyaw/kernel": patch
"@lincyaw/web": patch
"@lincyaw/workbench": patch
---

Bind inline preview position and playback messages to the workbench's current navigation generation. Delayed messages cannot pull another card back to an earlier step, including repeat visits to the same step. Acknowledge accepted local navigation without seeking its running clock, and re-report local input made while that acknowledgement was in transit.
