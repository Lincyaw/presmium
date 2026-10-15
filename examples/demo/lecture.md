---
title: Presmium Demo
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
    # The web form's addon: the "read on the web" button of the slides form (P-74).
    addons: ['@presmium/web']
  notebook: {}
---

# Presmium Demo

:::{slide}
同一份源码，多种媒介：网页、幻灯片与 notebook。
:::

这是示例文稿的封面。每个上下文的演示章节在 pages/ 目录中，由下面的 `{include}` 引入。

```{include} pages/core.md
```

```{include} pages/code.md
```

```{include} pages/exec.md
```

```{include} pages/exec-local.md
```

```{include} pages/web.md
```
