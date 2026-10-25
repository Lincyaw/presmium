---
title: 时间轴：动画怎样对上讲解
lang: zh-CN
plugins:
  - '@lincyaw/addon-motion'
  - '@lincyaw/addon-lecture'
renderers:
  web: {}
---

(intro)=
# 时间轴：动画怎样对上讲解

每一节用同一个场景：一排圆点，每一步亮起一个，所以看画面就知道走到了第几步。在放映视图中逐步前进，演讲者窗口显示每一步对应的讲解；给文稿加上 `lecture` 渲染端与语音后构建，`dist/lecture/script/track.json` 列出每一步开始的时刻。

(one-per-step)=
## 每步一段讲解

(one-per-step-scene)=
:::{scene} steps
:durations: 0.8, 0.8, 0.8
三个圆点，每一步亮起一个。
:::

第一步，第一个点亮起。讲解的第一个字一出来，这一步的动画就开始演。

第二步，第二个点。块后面的第二段讲解属于第二步。

第三步，第三个点。讲解比动画长，动画演完就停在那里等着。

(fewer)=
## 段落少于步数

(fewer-scene)=
:::{scene} steps
:durations: 0.8, 0.8, 0.8
三个圆点，只有两段讲解。
:::

第一个点。

第二个点。下一步没有讲解，只停到动画演完。

(more)=
## 段落多于步数

(more-scene)=
:::{scene} steps
:durations: 0.8, 0.8
两个圆点，三段讲解。
:::

第一个点。

第二个点。

这一段已经超出了步数，也算在最后一步，画面不再变化。

(long)=
## 动画比讲解长

(long-scene)=
:::{scene} steps
:durations: 3, 3
两个慢慢亮起的圆点。
:::

很短的一句。

又一句。

(cue-next)=
## 一段之内推进

(cue-next-scene)=
:::{scene} steps
:durations: 0.6, 0.6, 0.6
三个圆点，在一句话里依次亮起。
:::

先看第一个点，{cue}`next` 说到这里第二个亮起，{cue}`next` 说到这里第三个也亮了。

(early)=
## 推进得太早

(early-scene)=
:::{scene} steps
:durations: 2.5, 2.5
两个慢点，第一步还没演完就推进。
:::

马上 {cue}`next` 推进，构建会在这一段给出警告。

(two-scenes)=
## 一节里的两个场景

(first)=
:::{scene} steps
:durations: 0.8, 0.8
前一个场景。
:::

前一个场景的第一步。

前一个场景的第二步。

(second)=
:::{scene} steps
:durations: 0.8, 0.8
:reveal:
后一个场景，写了 reveal，在前一个演完之后才开始。
:::

后一个场景的第一步。

后一个场景的第二步。

(pause)=
## 停顿与聚光

(pause-scene)=
:::{scene} steps
:durations: 0.8, 0.8
两个圆点。
:::

说完这半句，{cue}`pause 1s` 停一秒再说下半句。

第二步，{cue to=pause-scene}`spot` 聚光落在这个场景上。

(with-code)=
## 场景与代码一起走

(sort-code)=
```python
def bubble_pass(a):
    for i in range(len(a) - 1):
        if a[i] > a[i + 1]:
            a[i], a[i + 1] = a[i + 1], a[i]
    return a
```

(bubble)=
:::{scene} bubble
:durations: 1.0, 0.8, 1.0, 1.0, 1.5
5 2 4 1 3 的一趟冒泡：5 与右边的数逐个比较、交换，最后停在末尾。
:::

代码和场景放在同一节：场景占五步，讲解逐段对应，提示标记指向代码。先看这五个数。

第一次比较 5 和 2，{cue to=sort-code lines=3}`spot` 这一行做比较。

5 比 2 大，{cue to=sort-code lines=4}`spot` 这一行交换它们。

再比较 5 和 4，又是前面大，再交换。

5 继续往后，越过 1 和 3，{cue}`pause 300ms` 停在最后，这一趟结束。
