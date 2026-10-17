---
title: 步骤可逆
lang: zh-CN
plugins:
  - '@presmium/slidev-addon-core'
renderers:
  web: {}
---

# 步骤可逆

e2e/viewer.spec.ts 的测试文稿（K-04，F-77）：网页形态中直接跳到第 N 步与从第 0 步走到第 N 步，画面相同。

(walk)=
## 一步一步合并

:::{slide}
:reveal: items
- 先把文本切成字节
- 再数相邻的每一对
:::

先切开，再计数。

:::{component} PmDemoStepper
:span: 3
steps: [数对, 选出最多的一对, 合并]
:::

步进组件依次突出三个阶段。

```{code} python
:reveal:
pairs = Counter(zip(tokens, tokens[1:]))
best = max(pairs, key=pairs.get)
tokens = merge(tokens, best, 256)
```

最后一步出现合并的代码。
