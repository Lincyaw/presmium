---
title: Offline fixture
plugins:
  - ADDON_DIR
renderers:
  slides:
    theme: default
    favicon: /favicon.svg
    fonts:
      provider: none
---

## Offline

The image is downloaded at compile time; `public/pyodide/` stands in for a bundled Pyodide runtime.

:::{slide}
![remote image](REMOTE_IMAGE)
:::
