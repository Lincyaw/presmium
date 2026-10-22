---
title: 插件扩展示例
plugins:
  - './plugin'
  - './broken'
renderers:
  web: {}
---

# 插件扩展示例

示例插件为 IR 运行时注册一个视图和两个渲染器。

(table)=
## 表格

插件为 `csv` 代码块注册了渲染器，代码块显示为表格[^csv]。

[^csv]: CSV 是逗号分隔的值。

```csv
名称,数量
苹果,3
```

插件还为组件 PmSwap 注册了渲染器，替换组件本身。

:::{component} PmSwap
:::

(probe)=
## 探针

:::{hints}
web: { accent: teal }
:::

:::{component} PmProbe
:span: 2
:::

第零步，探针只显示“丙”。

第一步，“甲”和“乙”出现。

第二步，“丙”隐去。

```{include} notes.md
```
