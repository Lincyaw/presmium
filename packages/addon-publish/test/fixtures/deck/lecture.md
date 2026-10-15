---
title: Publish fixture
plugins:
  - ADDON_DIR
renderers:
  slides:
    theme: default
    fonts:
      provider: none
---

## Code with a permalink

:::{slide}
[math.py#L1-L2 @ 3f2a9c1](https://github.com/presmium/sample-repo/blob/3f2a9c1/src/math.py#L1-L2)
:::

```py
def add(a, b):
    return a + b
```

## Steps

:::{slide}
Always visible.
:::

:::{slide}
:reveal:
Shown after one click.
:::

## Hidden link

:::{slide}
<div style="display: none">

[a link that never renders](https://example.com/hidden)

<span data-ref='{"href": "https://example.com/json-prop"}'>nor does a link passed to a component as JSON</span>

</div>
:::
