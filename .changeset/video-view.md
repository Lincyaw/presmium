---
'@lincyaw/workbench': minor
'@lincyaw/slidev-addon-lecture': minor
'@lincyaw/web': patch
---

The workbench previews the lecture video.

- `@lincyaw/workbench`: a Video view beside Document, Present and Slides when the document can be made into a video: the presentation played on the lecture's timeline, with its narration, captions, cues and player, in a preview page of its own (kept while switching); above it, the video file's bar (made from the current content or before, its progress; make, play, download, cancel).
- `@lincyaw/slidev-addon-lecture`: `defaultTrack`, the lecture a video is made of (the narrated script, else the only recording); in a workbench's preview the lecture view opens it at once.
- `@lincyaw/web`: the viewer app takes the place and the view in its address (`?view=…&section=…&step=…`) and keeps an overlay view's place there, as the site does.
