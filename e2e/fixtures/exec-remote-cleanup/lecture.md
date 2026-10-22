---
title: Jupyter 生命周期回归
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
---

# Jupyter 生命周期回归

(transient)=
```{code} python
:run: live
:env: lab
print("transient-42")
```

(persistent)=
```{code} python
:run: live
:env: lab
:session: cleanup
from pathlib import Path
Path("nested").mkdir(exist_ok=True)
Path("nested/result.txt").write_text("session-42")
print("session-42")
```

(hidden)=
```{code} python
:run: live
:env: lab
from pathlib import Path
Path(".hidden").write_text("hidden from the Jupyter Contents API")
print(42)
```

:::{terminal} lab
:height: 8
:::
