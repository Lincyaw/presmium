---
'@lincyaw/slidev-addon-lecture': minor
'@lincyaw/render-slides': patch
'@lincyaw/workbench': patch
---

The lecture plays on its timeline even when some sentences cannot be said yet.

- `@lincyaw/slidev-addon-lecture`: a synthesized lecture whose engine cannot say a sentence is still served for playing: the sentence is silent for the time it would take (`spokenDuration`), marked `Utterance.unsaid` with the reason, and its caption is shown; the player says how many sentences have no voice. Builds, exported videos and the agent's tools still need every sentence said; an export's error starts with its first reason. The player shows the server's reason instead of an HTTP status, and its caption sits above the player however tall the player is.
- `@lincyaw/render-slides`: a slides export that fails while Vite optimizes a deck's dependencies on its first run is run once more.
- `@lincyaw/workbench`: the video file's bar shows a progress bar while the file is made (indeterminate until the frames are counted), a failure in the danger colour with its first reason, and the log.
