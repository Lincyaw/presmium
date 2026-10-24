---
title: 讲授测试文稿
lang: zh-CN
plugins:
  - '@lincyaw/addon-guide'
  - '@lincyaw/addon-lecture'
renderers:
  web:
    port: 5323
---

(intro)=
# 讲授测试文稿

e2e/lecture.spec.ts 的测试文稿：在放映视图中录制讲授，并以讲授轨回放（`lectures/demo/track.json`）。

(merge)=
## 合并

(merge-code)=
```python
def merge(ids, pair, idx):
    out = []
    i = 0
    while i < len(ids):
        if ids[i:i + 2] == list(pair):
            out.append(idx)
            i += 2
        else:
            out.append(ids[i])
            i += 1
    return out
```

:::{slide}
:reveal:
第一步：找出出现最多的字节对。
:::

讲解第一步。

:::{slide}
:reveal:
第二步：把它合并成新符号。
:::

讲解第二步。

(end)=
## 结尾

最后一节。

(part.two:x)=
## 第二部分

章节 ID 带有 CSS 中有含义的字符（`.` 与 `:`）。

(part-code)=
```python
total = sum(ids)
```
