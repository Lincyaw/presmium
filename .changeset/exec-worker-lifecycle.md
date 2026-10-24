---
"@lincyaw/addon-exec": patch
---

开发预览提前预打包 JavaScript 与 TypeScript 执行器的 sucrase 依赖，避免首次运行触发页面重载并丢失输出。

页面暂停、离开或插件替换时取消仍在执行的脚本并结束其 Worker；恢复页面后使用新的执行器，避免后台任务残留。

Python 执行器释放后取消尚在排队的运行和跟踪请求，避免旧队列在页面暂停后重新创建 Worker 并执行代码。
