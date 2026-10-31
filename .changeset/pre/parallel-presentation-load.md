---
'@lincyaw/web': patch
---

A page fetches what it will need in parallel with the app instead of one file after the other: its document (`ir.json`) and code bundle on every page, and on a presentation also its scene chunks, the shared modules they import, the animation library of their engine and the viewer chunk.
