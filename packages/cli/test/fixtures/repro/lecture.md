---
title: Reproducible builds
plugins:
  - '@lincyaw/addon-core'
  - ./plugin
presmium:
  fixture.repro: { data: ./img, site: /tmp }
renderers:
  web: {}
  slides: {}
  notebook: {}
---

# Reproducible builds

:::{slide}
The same deck builds to the same bytes wherever it is checked out.
:::

```{include} pages/one.md
```

```{include} pages/two.md
```
