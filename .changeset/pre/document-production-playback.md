---
"@lincyaw/kernel": minor
"@lincyaw/compiler": minor
"@lincyaw/addon-lecture": minor
---

Resolve document, section and step production voice settings by stable step identity, including explicit no-voice overrides. Derive minimum holds and explicit step trailing pauses from Production while retaining existing valid speech cache entries.

Refuse lecture generation when declared media mixing or step pauses inside an advancing narration clip cannot be represented faithfully. Remove the old playback-track transcript editing and resynthesis routes and controls, which bypassed canonical document transactions. Captions remain available for reading and seeking; video authoring must use the versioned document model.
