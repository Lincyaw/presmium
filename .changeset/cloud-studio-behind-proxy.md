---
"@lincyaw/server": minor
"@lincyaw/workspace": minor
"@lincyaw/cli": minor
"@lincyaw/studio": minor
"@lincyaw/design": minor
---

Presmium Studio 与工作区服务可以放在反向代理之后：`presmium serve --public-url <来源>` 信任该来源的主机，并用它给出预览与导出产物的地址；`presmium studio --public-url <网址> --preview-url <来源>` 把浏览器使用的根地址交给 DeepSeek Harness（`--public-url`、`--trusted-host`），把预览的来源交给工作区服务。Presmium 云端用它为每个用户运行完整的 Studio。设计系统新增 `share` 与 `stop` 图标。
