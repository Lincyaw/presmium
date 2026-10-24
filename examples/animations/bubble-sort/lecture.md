---
title: 冒泡排序
lang: zh-CN
plugins:
  - '@lincyaw/addon-motion'
  - '@lincyaw/addon-guide'
  - '@lincyaw/addon-lecture'
  - '@lincyaw/addon-speech'
renderers:
  web: {}
  slides: {}
  notebook: {}
  lecture:
    voice: { engine: edge, voice: zh-CN-XiaoxiaoNeural }
---

(intro)=
# 冒泡排序

用一个动画讲清楚冒泡排序的一趟。

(pass)=
## 一趟冒泡

(sort-code)=
```python
def bubble_pass(a):
    for i in range(len(a) - 1):
        if a[i] > a[i + 1]:
            a[i], a[i + 1] = a[i + 1], a[i]
    return a
```

(stats)=
:::{component} CompareCount
:::

(bubble)=
:::{scene} bubble
:durations: 1.0, 0.8, 1.0, 1.0, 1.5
5 2 4 1 3 的一趟冒泡：5 与右边的数逐个比较、交换，最后停在末尾。
:::

冒泡排序每一趟比较相邻的两个数，把大的往后换。先看这五个数。

第一次比较 5 和 2，{cue to=stats}`click compare` 比较次数加一。

5 比 2 大，{cue to=sort-code lines=3-4}`spot` 交换它们。

再比较 5 和 4，{cue to=stats}`click compare` 又是前面大，再交换。

5 继续往后，越过 1 和 3，{cue}`pause 300ms` 停在最后，这一趟结束。

(summary)=
## 小结

一趟下来，最大的数到了末尾。
