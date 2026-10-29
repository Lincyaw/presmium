---
'@lincyaw/host': patch
'@lincyaw/viewer': patch
'@lincyaw/web': patch
'@lincyaw/addon-assistant': patch
'@lincyaw/addon-classroom': patch
'@lincyaw/addon-content': patch
'@lincyaw/addon-exec': patch
'@lincyaw/addon-exec-jupyter': patch
'@lincyaw/addon-exec-local': patch
'@lincyaw/addon-exec-wasi': patch
'@lincyaw/addon-exec-webgpu': patch
'@lincyaw/addon-lecture': patch
'@lincyaw/addon-motion': patch
'@lincyaw/addon-publish': patch
'@lincyaw/addon-session': patch
'@lincyaw/addon-speech': patch
'@lincyaw/addon-stage': patch
---

读者、讲者看到的界面文字按界面术语与文案规范（docs/glossary.md）统一：演示者视图、观众视图、结束放映、讲稿与配音、撤消、更新（不再显示“重新编译”）、网页视图；en 的命令、窗格与视图用 Title Case，消息与字段用 sentence case，弯引号与美式拼写（Canceled）。启动报告、对话框的“关闭”、站点启动失败与审批失败的提示改为目录文本；读者问答按共享的界面语言规则（`currentLocale()`）告诉模型用哪种语言回答；Notebook 中的终端说明、手动字幕过期提示、配音试听文字按文稿的 `lang` 取自目录。
