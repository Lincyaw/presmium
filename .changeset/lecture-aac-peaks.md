---
'@lincyaw/addon-lecture': patch
---

MP4 lecture videos keep the sound's peaks: FFmpeg's AAC encoder no longer substitutes noise, which turned some music into short bursts above the source's peak.
