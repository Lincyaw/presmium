---
title: 渲染端测试
plugins:
  - ../steps
renderers:
  slides:
    package: ../../..
    transition: none
---

# 渲染端测试

:::{slide}
封面上屏
:::

封面讲解。

(reveal)=
## 逐步出现

:::{slide}
:reveal: items
- 第一项
- 第二项
- 第三项
:::

第一项的讲解。

第二项的讲解。

第三项的讲解。

:::{slide}
:reveal:
最后出现的结论。
:::

- 结论的讲解，写成列表。

## 代码

```{stepcode} python
:lines: 1 | 2-3 | 4
def f(x):
    y = x + 1
    return y
print(f(1))
```

先看函数头。

再看函数体。

最后看调用。

```{morph} python
total = 0
===
total = sum(xs)
```

改写成 sum。

```{code} echo
:run:
hello
```

```{code} echo
:run:
exit 3
```

## 其他

:::{hints}
slides: { layout: center, class: pm-other }
:::

$$
E = mc^2
$$

![点](img/dot.svg) ![公共](/dot.svg)

:::{note}
模板语法 {{ name }} 与 `{{ code }}` 原样显示。
:::
