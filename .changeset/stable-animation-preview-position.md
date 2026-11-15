---
"@lincyaw/workbench": patch
"@lincyaw/dsh": patch
"@lincyaw/web": patch
"@lincyaw/viewer": patch
"@lincyaw/addon-motion": patch
---

动画预览首帧直接恢复当前步骤，避免切页时进度条先显示末尾再回跳；动画进度条复用公共范围控件，保持播放和跳步时的尺寸与绘制稳定。
