---
title: Late fixture
plugins:
  - PACKAGES_DIR/addon-core
  - ./late-start
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
