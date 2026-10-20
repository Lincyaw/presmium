---
title: JupyterHub 测试文稿
lang: zh-CN
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-exec'
  - '@lincyaw/slidev-addon-exec-jupyter'
# Each learner's own server on the spec's JupyterHub (./Dockerfile): `{user}` is the name the hub gives
# the token the learner pastes.
execute:
  environments:
    hub: { kind: jupyter, auth: prompt, url: 'http://127.0.0.1:5337/user/{user}/' }
renderers:
  web: {}
---

# JupyterHub 测试文稿

:::{slide}
e2e/exec-remote.spec.ts 的测试文稿：学习者粘贴 hub 的令牌后，代码在他自己的单用户服务器上运行。
:::

(mine)=
## 我的服务器

(whose)=
```{code} python
:run: live
:env: hub
import os
print("服务器属于", os.environ["JUPYTERHUB_USER"])
```
