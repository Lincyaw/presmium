---
title: Greeting
lang: en
plugins:
  - '@presmium/slidev-addon-core'   # the host of the slides form: plugin components and exports need it
  - ..                              # this plugin, by its directory; a document elsewhere names its package
renderers:
  web: {}
  slides: {}
  notebook: {}
---

# Greeting

A document that uses the plugin: `pnpm dev` shows it in the web page and the slides, `pnpm build`
builds the web page, the slides and the notebook into `example/dist/`.

(greeting)=
## Hello

The directive becomes the plugin's component; under `presmium dev` it can wave, through the plugin's
server route.

:::{greeting} reader
:::
