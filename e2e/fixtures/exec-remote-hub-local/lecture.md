---
title: 本地 JupyterHub 协议验证
lang: zh-CN
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-exec'
  - '@lincyaw/slidev-addon-exec-jupyter'
execute:
  environments:
    hub: { kind: jupyter, auth: prompt, url: '__HUB_URL__user/{user}/' }
renderers:
  web: {}
---

# 本地 JupyterHub 协议验证

(mine)=
## 我的服务器

(whose)=
```{code} python
:run: live
:env: hub
import os
print("服务器属于", os.environ["JUPYTERHUB_USER"])
print(6 * 7)
```
