---
title: 课堂会话测试文稿
lang: zh-CN
plugins:
  - '@lincyaw/addon-core'
  - '@lincyaw/addon-stage'
  - '@lincyaw/addon-session'
  - ./host/plugin
renderers:
  web: {}
  slides:
    theme: default
---

# 课堂会话测试文稿

:::{slide}
e2e/session.spec.ts 的测试文稿。这里没有配置课堂服务；需要课堂服务的用例在头部加上 `presmium.session.server`。
:::

```{include} session.md
```

```{include} web.md
```
