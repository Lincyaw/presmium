---
title: Local environment test deck
# The test replaces these placeholders with absolute package paths and free ports.
plugins:
  - __ADDON_CORE__
  - __ADDON_EXEC_LOCAL__
# The repository's devcontainer definition as a named environment (P-100).
execute:
  environments:
    box: { kind: devcontainer }
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
