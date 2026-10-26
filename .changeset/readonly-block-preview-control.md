---
"@lincyaw/kernel": patch
"@lincyaw/host": patch
"@lincyaw/viewer": patch
"@lincyaw/web": patch
"@lincyaw/addon-motion": patch
---

Add a typed, version-bound seek/pause protocol for read-only document widgets. Validate the parent window and origin, document, block ownership and stable step before navigating. Initial and reload seeks can choose a step's start; ordinary explicit seeks retain completed-step behavior.

Register local scene playback with the existing playback coordinator, so pausing a widget cancels pending starts and stops its current animation frame without losing time. Navigation boundaries remain transient runtime intent and never duplicate authoring or production timing.
