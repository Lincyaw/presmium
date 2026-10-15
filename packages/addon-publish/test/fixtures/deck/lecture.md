---
title: Publish fixture
plugins:
  - ADDON_DIR
  - PACKAGES_DIR/addon-code
presmium:
  presmium.code:
    repo: https://github.com/presmium/publish-fixture
renderers:
  slides:
    theme: default
    fonts:
      provider: none
---

## Code with a permalink

```{code-ref} region:math.py#add
:steps: check, sum
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
