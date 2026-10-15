---
title: Reproducible builds
plugins:
  - '@presmium/slidev-addon-core'
  - ./plugin
presmium:
  presmium.core: { demo: true }
  fixture.repro: { data: ./img, site: /tmp }
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
