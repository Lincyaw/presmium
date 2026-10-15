---
title: Reproducible builds
plugins:
  - '@presmium/slidev-addon-core'
presmium:
  presmium.core: { demo: true }
renderers:
  web: {}
  slides: {}
---

# Reproducible builds

:::{slide}
The same deck builds to the same bytes wherever it is checked out.
:::

```{include} pages/one.md
```

```{include} pages/two.md
```
