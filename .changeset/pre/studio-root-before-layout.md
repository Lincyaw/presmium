---
'@lincyaw/dsh': patch
---

Register the workbench root before exposing its layout service, and remove the service before the root during cleanup, so renderer activation always has an available root.
