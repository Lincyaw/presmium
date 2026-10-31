---
"@lincyaw/addon-motion": patch
---

Defer scene construction outside the reading viewport while preserving instances once shown. Presentation, print and video export continue to create the active scene immediately, so their step and frame behavior stays deterministic.
