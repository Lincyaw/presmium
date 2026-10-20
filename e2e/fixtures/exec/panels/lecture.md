---
title: 执行测试文稿
lang: zh-CN
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-exec'
renderers:
  web: {}
  slides:
    theme: default
---

# 执行测试文稿

:::{slide}
e2e/exec.spec.ts 的测试文稿：执行面板、分步执行、预录输出、编译时执行与长代码的面板。
:::

```{include} exec.md
```

```{include} long.md
```
