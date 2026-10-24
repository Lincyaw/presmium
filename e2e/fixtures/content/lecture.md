---
title: 富内容测试文稿
lang: zh-CN
plugins:
  - '@lincyaw/addon-core'
  - '@lincyaw/addon-content'
  - '@lincyaw/addon-publish'
  - ./plugin
renderers:
  web: {}
  slides:
    theme: default
---

# 富内容测试文稿

:::{slide}
e2e/content.spec.ts 的测试文稿。PlantUML 图已下载到 `.presmium/assets`，构建不需要网络。
:::

```{include} content.md
```

```{include} cards.md
```
