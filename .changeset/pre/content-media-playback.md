---
"@lincyaw/addon-content": patch
"@lincyaw/host": patch
"@lincyaw/viewer": patch
"@lincyaw/render-slides": patch
---

切换幻灯片、到达块的 until 步骤或卸载组件时暂停视频和音频，避免隐藏的媒体继续播放；总览与下一页预览不自动播放。返回后保留手动控制，仅在仍启用自动播放时恢复中断的自动播放，网页阅读时仍可自行控制屏幕外的音频。宿主新增 useBlockStepRange，提供父子块显示范围的交集而不改变原有步骤偏移。
