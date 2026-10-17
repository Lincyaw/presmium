---
title: MCP 测试文稿
plugins:
  - '@presmium/slidev-addon-exec'
  - ./plugin
renderers:
  notebook: {}
---

# MCP 测试文稿

封面。

(merge)=
## 合并

讲解：每一轮合并出现次数最多的相邻对。

```{code} python
:run:
print(6 * 7)
```

## 第三节

最后一节的正文。

```{code} python
:run:
:session: s
x = 6
```

```{code} python
:run:
:session: s
print(x * 7)
```
