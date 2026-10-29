---
"@lincyaw/kernel": patch
"@lincyaw/compiler": patch
"@lincyaw/web": patch
"@lincyaw/mcp": patch
"@lincyaw/language-server": patch
"@lincyaw/addon-speech": patch
"@lincyaw/addon-motion": patch
"@lincyaw/addon-session": patch
---

修复保留修改时间的文件替换和编译期间编辑导致的缓存过期问题，共用完整本机文件版本标识。各文稿的离线缓存独立更新，打开另一份文稿后仍可离线访问原文稿。语言服务使用文稿安装的 Presmium 入口及随附插件。

修复连续调整尺寸时旧动画构建覆盖新画面、GSAP 构建失败后残留动画，以及切换或关闭课堂连接后的文档与订阅资源释放。
