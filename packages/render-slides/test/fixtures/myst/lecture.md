---
title: MyST in slides
plugins:
  - ../steps
  - ../widgets
  - ../twin
renderers:
  web:
    package: ../site
  slides:
    package: ../../..
    transition: none
  notebook:
    package: ../../../../render-notebook
---

# MyST in slides

(only)=
## Only

::::{only} web
:reveal:
:::{slide}
Shown on the web only, at a step of its own.
:::
::::

```{code} python
:reveal:
print("after")
```

## MyST

:::{figure} img/dot.svg
:label: fig-dot
A dot.
:::

:::{dropdown} Open me
Hidden body.
:::

::::{slide}
Term
: Definition of the term.

See [the first section](#only) and {numref}`fig-dot`.
::::

:::{iframe} https://example.org/embed
:width: 80%
An embedded page.
:::

```{include} pages/media.md
```

## Components

:::{boom}
:::

:::{panel}
:::

:::{twin}
:::

:::{pointer}
:::

## Notes

```{include} notes/one.md
```

```{include} notes/two.md
```
