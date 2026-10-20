---
title: MCP 测试文稿
plugins:
  - '@lincyaw/slidev-addon-exec'
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

(teacher)=
## 教师讲评

:::{audience} teacher
:::

讲评时先问学生合并的顺序 TEACHERNOTE27。

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

::::{only} notebook
:::{slide}
:reveal:
只在 notebook 中出现的一步。
:::
::::

:::{slide}
:reveal:
两种形态都有的一步。
:::
