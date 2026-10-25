---
title: 步骤讲解
lang: zh-CN
plugins:
  - '@lincyaw/addon-motion'
  - '@lincyaw/addon-lecture'
  - '@lincyaw/addon-speech'
renderers:
  web: {}
  slides: {}
  lecture:
    voice: { engine: fake, voice: alpha }
    gap: 0ms
---

(intro)=
# 步骤讲解

开场。

(animation)=
## 三步动画

:::{narration}
:at: 2
:mode: after

第三步完成后讲。
:::

(scene)=
:::{scene} steps
:durations: 800ms, 1200ms, 1000ms
三步动画。
:::

先讲{cue}`pause 100ms`第一步。

再讲第二步。

第三步的补充讲解。

(reading)=
:::{only} web
这段只供阅读。
:::

(empty)=
## 空讲解动画

:::{scene} steps
:durations: 800ms, 1200ms, 1000ms
还没有讲解。
:::
