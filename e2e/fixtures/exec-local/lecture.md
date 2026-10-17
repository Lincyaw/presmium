---
title: 本地环境测试文稿
lang: zh-CN
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-exec'
  - '@presmium/slidev-addon-exec-local'
renderers:
  web: {}
  slides:
    theme: default
    # `presmium dev` in e2e/exec-local.spec.ts, in WP-89e's range; packages/addon-exec-local/test uses it too, never at the same time.
    port: 5333
---

# 本地环境测试文稿

:::{slide}
e2e/exec-local.spec.ts 的测试文稿：代码片段的工作区是 `workspace` 目录。
:::

```{include} exec-local.md
```
