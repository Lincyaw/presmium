---
title: Preview Protocol
lang: en
plugins:
  - '@presmium/slidev-addon-core'
  - ./plugin
renderers:
  web: {}
  slides: {}
---

# Preview Protocol

The deck that e2e/preview-protocol.spec.ts drives through the preview protocol from a host page.

(alpha)=
## Alpha

(alpha-text)=
:::{slide}
The first block of alpha, with a mark {mark}`here` for the author.
:::

Alpha's narration.

(beta)=
## Beta

(beta-intro)=
:::{slide}
Beta starts with this block.
:::

::::{only} web
:reveal:
(beta-web)=
:::{slide}
The web shows this block at a step of its own, which the slides do not have.
:::
::::

(beta-step)=
:::{slide}
:reveal:
Beta's last step shows this block.
:::

(gamma)=
## Gamma

(gamma-text)=
:::{slide}
Gamma closes the deck.
:::
