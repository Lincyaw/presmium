---
title: MyST 节点
plugins:
  - ./plugin
renderers:
  web: {}
---

# MyST 节点

MyST 的内置角色与指令在网页形态中的呈现。

(myst-roles)=
## 角色

按 {kbd}`Ctrl` + {kbd}`K` 打开搜索；水是 H{sub}`2`O，能量是 E = mc{sup}`2`；{abbr}`IR (intermediate representation)` 是中间表示。

指令见 {ref}`myst-directives`，本节见 [](#myst-roles)。

(myst-directives)=
## 指令

讲台
: 放映时演讲者所在的位置。

听众视图
: 投影给听众看的画面。

:::{dropdown} 展开细节
折叠起来的补充说明。
:::

:::{admonition} 小贴士
:class: tip
带类的提示框。
:::

:::{note}
:class: pm-fixture-note
普通的注意事项。
:::

(raw-html)=
## 原始 HTML

Energy <b>is</b> $E = mc^2$ here.

| 键 | 说明 |
|---|---|
| <kbd>Ctrl</kbd> | 第一行<br>第二行，公式 $x^2$ 也在 |

(embed)=
## 嵌入页面

:::{iframe} https://example.com/
:width: 80%
嵌入的页面
:::

(versions)=
## 代码版本

:::{versions} python
def merge(pair):
    return pair
+++
def merge(pair, new_id):
    first, second = pair
    return new_id
:::

逐步切换代码的版本。

(pinned)=
## 锁定的代码

:::{pinned} python
counts = {}
print(counts)
:::
