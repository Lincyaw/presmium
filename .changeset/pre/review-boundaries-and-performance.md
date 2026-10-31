---
"@lincyaw/compiler": patch
"@lincyaw/kernel": patch
"@lincyaw/workspace": patch
"@lincyaw/workbench": patch
"@lincyaw/web": patch
"@lincyaw/addon-exec-local": patch
"@lincyaw/addon-exec-jupyter": patch
"@lincyaw/addon-exec-wasi": patch
"@lincyaw/addon-lecture": patch
"@lincyaw/addon-publish": patch
---

减少编译器启动时加载的无用解析模块，解除编辑模型对显示组件的循环依赖，并加快审阅接受、恢复与批量提交。devcontainer 指纹和导出归档共用定义文件范围，文稿编辑不再使仅使用镜像的环境失效。

修复 WASI 编译时读取请求头文件、Jupyter 终端启动失败后的资源释放、原生 Node 中加载 Chromium，以及浏览器导出启动失败后的清理。讲授构建保留完整文稿的语音锁定记录，学生版构建后仍可离线构建完整版。
