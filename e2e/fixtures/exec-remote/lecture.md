---
title: 远端环境测试文稿
lang: zh-CN
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-exec'
  - '@presmium/slidev-addon-exec-jupyter'
# The spec runs templates/env/compose/compose.yaml and gives the operator's pair
# (PRESMIUM_ENV_LAB_URL, PRESMIUM_ENV_LAB_TOKEN) to the build and the dev server; the static
# build for `auth: prompt` replaces the environment with one the learner pastes a token for.
execute:
  environments:
    lab: { kind: jupyter, auth: proxy, image: 'quay.io/jupyter/base-notebook:2026-10-12@sha256:3fc2b8023bb7e3f11a09bd77aa07575c1ece16a0b9b64556757e34c52f667a1a' }
renderers:
  web:
    port: 4845
  slides:
    theme: default
---

# 远端环境测试文稿

:::{slide}
e2e/exec-remote.spec.ts 的测试文稿：Jupyter 环境中的代码块、会话与终端。
:::

(remote)=
## 远端内核

构建时与浏览器中都在 compose 的内核中运行，输出相同。

(where)=
```{code} python
:run: both
:env: lab
import platform
print("远端内核", platform.python_implementation(), 6 * 7)
```

(session)=
## 执行会话

同一会话的代码块在同一个内核中运行；每个页面、每个学习者有自己的内核。

(define)=
```{code} python
:run: live
:env: lab
:session: counter
x = 41
print("定义了 x")
```

(use)=
```{code} python
:run: live
:env: lab
:session: counter
print(x + 1)
```

(shell)=
## 终端

:::{terminal} lab
:height: 12
:::
