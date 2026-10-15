---
title: Presmium Demo
lang: zh-CN
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-stage'
  - '@presmium/slidev-addon-code'
  - '@presmium/slidev-addon-exec'
  - '@presmium/slidev-addon-exec-local'
  - '@presmium/slidev-addon-guide'
  - '@presmium/slidev-addon-content'
  - '@presmium/slidev-addon-publish'
  - '@presmium/slidev-addon-session'
  - '@presmium/slidev-addon-classroom'
presmium:
  presmium.core:
    demo: true
renderers:
  web: {}
  slides:
    theme: default
  notebook: {}
---

# Presmium Demo

:::{slide}
同一份源码，多种媒介：网页、幻灯片与 notebook。
:::

这是示例文稿的封面。每个上下文的演示章节在 pages/ 目录中，由下面的 `{include}` 引入。

```{include} pages/core.md
```

```{include} pages/stage.md
```

```{include} pages/code.md
```

```{include} pages/exec.md
```

```{include} pages/exec-local.md
```

```{include} pages/guide.md
```

```{include} pages/content.md
```

```{include} pages/publish.md
```

```{include} pages/web.md
```

```{include} pages/session.md
```

```{include} pages/classroom.md
```
