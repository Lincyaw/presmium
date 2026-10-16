---
title: Export fixture
plugins:
  - PACKAGES_DIR/addon-core
  - ADDON_DIR
  - PACKAGES_DIR/addon-classroom
renderers:
  slides:
    base: talks/export
    theme: default
    fonts:
      provider: none
---

## One

:::{slide}
The first slide, with [the notes](notes.txt).
:::

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
