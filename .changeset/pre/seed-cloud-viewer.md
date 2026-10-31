---
"@lincyaw/web": patch
"@lincyaw/workbench": patch
---

Allow hosted Studio images to seed a fingerprint-checked viewer cache, avoiding runtime bundling of official plugins on first preview.

Only time out an inline preview's display handshake while its content viewport is visible; offscreen preloading no longer reports a paint timeout.
