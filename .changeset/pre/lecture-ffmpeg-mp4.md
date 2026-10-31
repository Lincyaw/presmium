---
'@lincyaw/addon-lecture': patch
'@lincyaw/kernel': patch
'@lincyaw/cli': patch
---

Lecture videos are sharper. With FFmpeg installed (`ffmpeg` on the path, or `PRESMIUM_FFMPEG`), the export writes MP4 (H.264, AAC, captions as a subtitle track) from lossless frames; without it the browser encodes WebM at a bitrate scaled to the frame size, and the export says how to install FFmpeg. The default size is 1920×1080. `presmium serve` names the install command when FFmpeg is missing, and the Studio image includes it.
