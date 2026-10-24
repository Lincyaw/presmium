---
title: 宿主适配测试文稿
lang: zh-CN
plugins:
  - '@lincyaw/addon-core'
  - ./plugin
  - ./services
renderers:
  web: {}
  slides:
    theme: default
---

# 宿主适配测试文稿

:::{slide}
插件之间的服务依赖、步骤驱动的组件、动画、错误边界与步骤作用域。组件与三个演示插件来自本目录的测试插件 `./plugin` 与 `./services`。
:::

```{include} host.md
```
