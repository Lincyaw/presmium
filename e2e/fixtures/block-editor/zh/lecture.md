---
title: 块编辑
lang: zh-CN
contentModel: blocks
plugins: ['@lincyaw/addon-motion']
renderers:
  web: {}
  slides: {}
---

(intro)=
# 正文页面

(body)=
可编辑的正文。

:::{narration}
:at: 0
:mode: during

独立的讲解文本。
:::

(animation)=
## 动画页面

(scene)=
:::{scene} steps
:durations: 800ms, 1200ms, 1000ms
:::

:::{narration}
:at: 1
:mode: after

第二步的讲解。
:::

(empty)=
## 空白页面

(late)=
## 分步定位

::::{slide}
:at: 0

(late-first)=
:::{scene} later
:durations: 1000ms, 1000ms, 1000ms, 1000ms
:height: 40rem
:::
::::

::::{slide}
:at: 4

(late-second)=
:::{scene} later
:durations: 1000ms, 1000ms, 1000ms, 1000ms
:height: 40rem
:::
::::

::::{slide}
:at: 8

(late-third)=
:::{scene} later
:durations: 1000ms, 1000ms, 1000ms, 1000ms
:height: 40rem
:::
::::
