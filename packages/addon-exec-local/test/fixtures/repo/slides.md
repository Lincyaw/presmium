---
theme: none
title: Local environment test deck
# The test replaces these placeholders with the absolute addon paths.
addons:
  - __ADDON_CORE__
  - __ADDON_EXEC_LOCAL__
---

# 本地环境测试

<PmLocalEnv file="src/greet.py" lang="python">

```python
def greet(name):
    return f"你好，{name}"


print(greet("Presmium"))
```

</PmLocalEnv>
