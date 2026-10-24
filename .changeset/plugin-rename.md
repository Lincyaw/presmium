---
'@lincyaw/addon-assistant': minor
'@lincyaw/addon-classroom': minor
'@lincyaw/addon-code': minor
'@lincyaw/addon-content': minor
'@lincyaw/addon-exec': minor
'@lincyaw/addon-exec-jupyter': minor
'@lincyaw/addon-exec-local': minor
'@lincyaw/addon-exec-wasi': minor
'@lincyaw/addon-exec-webgpu': minor
'@lincyaw/addon-guide': minor
'@lincyaw/addon-lecture': minor
'@lincyaw/addon-motion': minor
'@lincyaw/addon-publish': minor
'@lincyaw/addon-session': minor
'@lincyaw/addon-speech': minor
'@lincyaw/addon-stage': minor
'@lincyaw/compiler': minor
---

The official plugins are renamed from `@lincyaw/slidev-addon-*` to `@lincyaw/addon-*`. A headmatter or an operator plugin list that still names a plugin the old way loads the renamed package; `presmium check` says the current name once for each (an `info` of `presmium.plugins`), and the IR lists the current names.
