---
title: 笔记本示例
plugins:
  - ./addons/python
  - ./addons/widgets
renderers:
  notebook:
    webUrl: https://example.org/lecture/
---

# 笔记本示例

:::{slide}
从 IR 生成 notebook
:::

本讲演示 notebook 渲染端：讲解成为 Markdown 单元格，代码成为可运行的单元格。

(sum)=
## 求和

先用 Python 求 1 到 10 的和，公式是 $n(n+1)/2$，参见 [高斯求和](https://example.org/gauss)。

:::{slide}
:reveal: items
- 写出求和代码
- 运行并核对结果
:::

```{code} python
:run:
total = sum(range(1, 11))
print("合计", total)
```

第一个单元格打印 `total` 的值，应当是 **55**。

```{code} python
:run:
import sys
squares = [n * n for n in range(4)]
print(squares)
print("这一行写到标准错误", file=sys.stderr)
```

第二个单元格同时写标准输出与标准错误。

```{code} bash
echo 不是内核语言的代码
```

讲解也可以是列表：

- 第一条讲解
- 第二条讲解

:::{only} web
只在网页中出现的段落。
:::

## 组件

:::{quiz} 1 加到 10 等于多少？
:::

测验由插件的 notebook 扩展渲染。

:::{chart}
| 年份 | 数量 |
|---|---|
| 2024 | 3 |
:::

图表在 notebook 中降级为表格。

:::{canvas}
:::

画布没有 notebook 形式，构建报告会列出它。
