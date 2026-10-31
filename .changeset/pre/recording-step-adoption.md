---
"@lincyaw/kernel": patch
"@lincyaw/compiler": patch
"@lincyaw/addon-lecture": patch
"@lincyaw/workspace": patch
"@lincyaw/mcp": patch
"@lincyaw/dsh": patch
"@lincyaw/workbench": patch
---

Explicitly adopt one local audio asset as a stable step's whole-file narration through the shared source-bound HTTP/MCP authoring service. Preserve narration, cues and pronunciation, pin actual audio SHA in the same history transaction, and derive one real recording use per step for the existing playback clock and cache-only lecture publisher. Empty narration plays without invented captions; unsupported cue timing is refused. Collect effective recording assets through compiler watching and audience filtering. No new Studio adoption button, trimming, cross-step allocation, recognition or synthesis is introduced.
