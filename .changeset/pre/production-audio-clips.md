---
"@lincyaw/kernel": minor
"@lincyaw/compiler": patch
"@lincyaw/addon-lecture": minor
"@lincyaw/dsh": patch
"@lincyaw/workbench": patch
---

Support canonical local audio MediaClips with real inspected asset identity, non-destructive trim ranges, gain and independent mute. Place clips only inside confirmed steps, mix them with exact cached speech through the shared playback/export plan, and expose source-bound AssetID inspection and plan-bound media reads. Reject unsupported video, recording, shared and remote inputs explicitly; this does not add binary import or media editing UI.
