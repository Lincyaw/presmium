---
title: 预测与讲解
lang: zh-CN
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-classroom'
renderers:
  web: {}
---

# 预测与讲解

e2e/viewer.spec.ts 的测试文稿：揭示一步的讲解移入 `PmPredict` 之后，网页的演讲者视图仍在备注与预告中显示它。

(merge)=
## 合并三轮

:::{slide}
语料 `aaabdaaabac`：BPE 每一轮把出现次数最多的相邻符号对合并成一个新符号。
:::

先请大家估计一下。

:::{predict} 合并三轮之后，词表中有几个新符号？
:choices: 1, 2, 3
:::

:::{slide}
:reveal:
三个：每一轮新增一个符号。
:::

每一轮只合并出现最多的那一对，所以三轮新增三个符号。
