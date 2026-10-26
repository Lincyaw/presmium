---
"@lincyaw/kernel": minor
"@lincyaw/host": patch
"@lincyaw/addon-lecture": patch
"@lincyaw/workbench": patch
---

Keep zero-duration steps individually selectable by sending their stable identity to the existing production player. Restore the selected event boundary on load and navigation while preserving absolute time seeking, binding checks, cancellation and the real clock. While paused on a zero-duration step, select its own captions (or none); preserve real timed captions during playback and positive-duration cue transitions.

Prevent a delayed page operation from mutating or clearing operation state in a document scope opened after its save barrier began.
