---
title: Offline fixture
plugins:
  - ADDON_DIR
  - PACKAGES_DIR/addon-exec
  - PACKAGES_DIR/addon-exec-wasi
  - PACKAGES_DIR/addon-exec-webgpu
renderers:
  web: {}
  slides:
    theme: default
    favicon: /favicon.svg
    fonts:
      provider: none
---

## Offline

The image is downloaded at compile time. The forms publish the Pyodide runtime and jax-js (the
execution and WebGPU plugins), and, since the Ruby code runs in the browser, the Ruby runtime
(WebAssembly and an archive), each with its licenses.

:::{slide}
![remote image](REMOTE_IMAGE)
:::

```{code} ruby
:run: live
puts [1, 2, 3].sum
```
