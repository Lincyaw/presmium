---
title: Jupyter 浏览器功能
lang: zh-CN
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-exec'
  - '@lincyaw/slidev-addon-exec-jupyter'
execute:
  environments:
    lab: { kind: jupyter, auth: proxy }
renderers:
  web: {}
  slides:
    theme: default
---

# Jupyter 浏览器功能

(remote)=
## 远端执行

(where)=
```{code} python
:run: both
:env: lab
import platform
print("Jupyter", platform.python_implementation(), 6 * 7)
```

(session)=
## 会话隔离

(define)=
```{code} python
:run: live
:env: lab
:session: browser
x = 41
print("defined")
```

(use)=
```{code} python
:run: live
:env: lab
:session: browser
print(x + 1)
```

(rich)=
## 富输出

(display)=
```{code} python
:run: live
:env: lab
from IPython.display import HTML, display
display(HTML('<strong id="jupyter-safe">rich-42</strong><img src="x" onerror="window.__jupyterUnsafe = 1"><script>window.__jupyterUnsafe = 2</script>'))
print("rich output")
```

(shell)=
## 终端

:::{terminal} lab
:height: 8
:::
