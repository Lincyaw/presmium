---
title: Local environment test deck
# The test replaces these placeholders with absolute package paths and free ports.
plugins:
  - __ADDON_CORE__
  - __ADDON_EXEC_LOCAL__
renderers:
  slides:
    package: __RENDER_SLIDES__
    theme: none
    port: __SLIDES_PORT__
  web:
    package: __RENDER_WEB__
    port: __WEB_PORT__
---

## 本地环境测试

```{local-env} python
:file: src/greet.py
def greet(name):
    return f"你好，{name}"


print(greet("Presmium"))
```
