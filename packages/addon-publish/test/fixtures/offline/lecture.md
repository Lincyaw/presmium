---
title: Offline fixture
plugins:
  - ADDON_DIR
  - PACKAGES_DIR/addon-exec-wasi
renderers:
  slides:
    theme: default
    favicon: /favicon.svg
    fonts:
      provider: none
---

## Offline

The image is downloaded at compile time; `public/pyodide/` stands in for a bundled Pyodide runtime.
The Ruby code runs in the browser, so the slides publish the Ruby runtime (WebAssembly and an archive).

:::{slide}
![remote image](REMOTE_IMAGE)
:::

```{code} ruby
:run: live
puts [1, 2, 3].sum
```
