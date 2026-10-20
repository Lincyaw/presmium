---
title: 网页阅读测试文稿
lang: zh-CN
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-exec'
  - '@lincyaw/slidev-addon-publish'
  - ./plugin
renderers:
  web: { base: /web/ }
  slides: { base: /slides/ }
---

(cover)=
# 网页阅读测试文稿

:::{slide}
同一份源码，生成网页与幻灯片。
:::

封面的讲解：这份文稿供 e2e/web.spec.ts 与 e2e/viewer.spec.ts 测试网页形态，第一章是一个不带章标题的源文件，第二章与第三章由同一个源文件中的章标题分开。

```{include} chapters/basics.md
```

```{include} chapters/advanced.md
```
