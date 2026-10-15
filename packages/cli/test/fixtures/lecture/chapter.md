(bpe-merge)=
## 合并最频繁的字节对

BPE 每一轮找出出现次数最多的相邻字节对，把它合并成一个新符号。

:::{slide}
:reveal: items
- 统计相邻字节对
- 合并出现最多的一对
:::

列表出现时的讲解，讲到其中两项。

```{code} echo
:run:
count pairs
```

:::{only} web, notebook
只在网页和 notebook 中出现的补充推导。
:::

:::{hints}
slides: { layout: two-cols }
:::

## 逐步演示

:::{component} FixtureStepper
:span: 1
labels: [统计, 合并]
:::

第一步统计相邻字节对。

第二步合并出现最多的一对。

:::{slide}
:reveal:
合并之后的符号：

- lo
- low
:::

符号出现时的讲解。

```{code} echo
:run:
:reveal:
merge pair
```

代码出现时的讲解。
