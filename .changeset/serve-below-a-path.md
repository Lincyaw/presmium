---
"@lincyaw/server": minor
"@lincyaw/workspace": minor
"@lincyaw/cli": minor
"@lincyaw/studio": minor
"@lincyaw/host": minor
"@lincyaw/web": minor
"@lincyaw/dsh": patch
"@lincyaw/addon-exec-jupyter": patch
"@lincyaw/addon-session": patch
---

工作区服务可以放在一个路径下面：`presmium serve --public-url https://host/user/a/preview/` 时，网站、预览、导出产物与 `__presmium/` 路由都在该路径下，代理原样转发路径即可（例如 JupyterHub 的 jupyter-server-proxy）。页面的 `AppConfig.server` 给出这个前缀，`@lincyaw/host` 的服务端客户端与控制通道据此访问路由，并新增 `pluginRoutePath` 供插件拼出自己的路由；Jupyter 执行环境与课堂同步改用它。路径不同的导出不会互相复用产物。`presmium studio` 新增 `--preview-port`，并把带启动令牌的地址写进 0600 的状态文件；工作台对文稿上下文的请求改为相对地址，可在路径下工作。
