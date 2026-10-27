---
"@lincyaw/viewer": patch
"@lincyaw/addon-motion": patch
---

修复动画在放映中缩在左上角的问题：不为所有步骤都隐藏的内容保留布局空间，居中缩放后的内容，动画使用放映可用宽度，并以变换前的布局尺寸初始化和调整场景。
