---
"@lincyaw/workbench": patch
"@lincyaw/design": patch
"@lincyaw/dsh": patch
"@lincyaw/addon-motion": patch
---

文档内预览失败后以紧凑的可读 fallback 和原刷新入口恢复，暂停并移除旧画面，拒绝晚到的旧状态。内联 HTTP 错误保留完整诊断并局部反馈，显式放映、网络和保存失败继续全局反馈，互不清除。

文档内动画初次加载与重载显示当前步骤完成画面；播放从所选步骤起点重播，中途暂停可继续，拖动进度条保留明确定位。
