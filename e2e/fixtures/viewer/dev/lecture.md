---
title: 实时预览测试文稿
lang: zh-CN
plugins:
  - '@lincyaw/slidev-addon-exec'
  - ./plugin
renderers:
  web: {}
---

# 实时预览测试文稿

`presmium dev` 的测试文稿（e2e/viewer.spec.ts）：测试编辑 pages/web.md 与 pages/live.md，页面在不刷新的情况下更新。

```{include} pages/web.md
```

```{include} pages/live.md
```
