---
"@lincyaw/kernel": patch
"@lincyaw/host": patch
"@lincyaw/web": patch
"@lincyaw/workbench": patch
"@lincyaw/dsh": patch
---

Reuse Studio's authenticated event connection for embedded live-viewer updates and classroom control. Preserve standalone SSE and the original five workspace event frame shapes; release subscriptions by preview generation and reject late parked-frame events.
