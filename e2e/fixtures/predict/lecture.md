---
title: 先预测再揭示
lang: zh-CN
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-session'
  - '@lincyaw/slidev-addon-classroom'
presmium:
  presmium.session:
    # e2e/predict.spec.ts puts the address of the classroom server it starts here.
    server: ws://classroom.invalid
renderers:
  web: {}
  slides:
    theme: default
---

# 先预测再揭示

e2e/predict.spec.ts 的测试文稿：读者先写下预测，之后一步的内容才显示。

(merge)=
## 合并三轮

:::{slide}
语料 `aaabdaaabac`：BPE 每一轮把出现次数最多的相邻符号对合并成一个新符号。
:::

:::{predict} 合并三轮之后，词表中有几个新符号？
:choices: 1, 2, 3
:::

:::{slide}
:reveal:
三个：每一轮新增一个符号。
:::

每一轮只合并出现最多的那一对，所以三轮新增三个符号。

(why)=
## 从字符开始

:::{predict} 为什么 BPE 从单个字符开始合并？
写一句话就好。
:::

:::{slide}
:reveal:
从字符开始，任何词都能切分，不会遇到词表之外的词。
:::
