---
title: Export fixture
plugins:
  - PACKAGES_DIR/addon-core
  - ADDON_DIR
  - PACKAGES_DIR/addon-classroom
renderers:
  slides:
    theme: default
    fonts:
      provider: none
---

## One

The first slide.

## Two

:::{slide}
Always visible.
:::

:::{slide}
:reveal:
Shown after one click.
:::

## Quiz

```{quiz}
Which pair does BPE merge in each round?

- [ ] The pair that comes first
- [x] The most frequent pair
```

## Four

The last slide.
