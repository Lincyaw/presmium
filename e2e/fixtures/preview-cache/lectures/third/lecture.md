---
title: Third lecture
lang: en
plugins: ['./plugin']
renderers:
  web: {}
---

# Third lecture

The third document makes the preview pool evict its least recently used iframe.

## Cache limit

Only the current lecture and one inactive lecture may keep their loaded modules.

This lecture's plugin has not declared that it can restart, so leaving the lecture destroys its iframe.
