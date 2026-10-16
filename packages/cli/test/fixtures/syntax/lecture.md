---
title: Syntax
lang: en
plugins:
  - ../addons/echo
  - ../addons/render
renderers:
  fixture: {}
---

## Intro

The section before the labelled one takes what its label leaves.

(intro)=
## Introduction proper

```{code-cell} echo
:run:
hello cell
```

## Only

::::{only} web
:reveal:
:::{slide}
Shown on the web only, at a step of its own.
:::
::::

```{code} echo
:reveal:
after
```

:::{only} slide
A misspelled renderer id hides this everywhere.
:::

```{include} chapters/a.md
```

```{include} chapters/b.md
```
