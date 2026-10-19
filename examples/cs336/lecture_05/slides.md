---
title: "CS336 Lecture 05: GPUs"
lang: en
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-content'
renderers:
  slides: {}
---

(cs336-05-cover)=
# Lecture 05: GPUs

Stanford CS336 · Language Modeling from Scratch · Spring 2026.




(cs336-05-page-001)=
## Lecture 5 · 1

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 1: Lecture 5](pages/page-001.webp)


(cs336-05-page-002)=
## Outline and goals · 2

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 2: Outline and goals](pages/page-002.webp)


(cs336-05-page-003)=
## Before we start.. · 3

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 3: Before we start..](pages/page-003.webp)


(cs336-05-page-004)=
## Organization today: · 4

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 4: Organization today:](pages/page-004.webp)


(cs336-05-page-005)=
## Setting the stage: compute leads to predictable perf · 5

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 5: Setting the stage: compute leads to predictable perf](pages/page-005.webp)


(cs336-05-page-006)=
## How do we get compute scaling? Early on – Dennard scaing · 6

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 6: How do we get compute scaling? Early on – Dennard scaing](pages/page-006.webp)


(cs336-05-page-007)=
## Parallel scaling continues · 7

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 7: Parallel scaling continues](pages/page-007.webp)


(cs336-05-page-008)=
## How is a GPU different from a CPU? · 8

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 8: How is a GPU different from a CPU?](pages/page-008.webp)


(cs336-05-page-009)=
## Anatomy of a GPU (execution units) · 9

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 9: Anatomy of a GPU (execution units)](pages/page-009.webp)


(cs336-05-page-010)=
## Anatomy of a GPU (memory) · 10

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 10: Anatomy of a GPU (memory)](pages/page-010.webp)


(cs336-05-page-011)=
## Execution model of a GPU · 11

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 11: Execution model of a GPU](pages/page-011.webp)


(cs336-05-page-012)=
## Memory model of a GPU · 12

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 12: Memory model of a GPU](pages/page-012.webp)


(cs336-05-page-013)=
## Side thread – What about TPUs? · 13

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 13: Side thread – What about TPUs?](pages/page-013.webp)


(cs336-05-page-014)=
## Side thread – What about TPUs? · 14

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 14: Side thread – What about TPUs?](pages/page-014.webp)


(cs336-05-page-015)=
## Strengths of the GPU model · 15

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 15: Strengths of the GPU model](pages/page-015.webp)


(cs336-05-page-016)=
## GPUs as fast matrix multipliers · 16

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 16: GPUs as fast matrix multipliers](pages/page-016.webp)


(cs336-05-page-017)=
## New matmul hardware means matmuls are fast and special · 17

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 17: New matmul hardware means matmuls are fast and special](pages/page-017.webp)


(cs336-05-page-018)=
## Compute scaling is faster than memory scaling · 18

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 18: Compute scaling is faster than memory scaling](pages/page-018.webp)


(cs336-05-page-019)=
## Recap: GPUs – what are they and how do they work · 19

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 19: Recap: GPUs – what are they and how do they work](pages/page-019.webp)


(cs336-05-page-020)=
## Part 2: Making ML workloads fast on a GPU · 20

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 20: Part 2: Making ML workloads fast on a GPU](pages/page-020.webp)


(cs336-05-page-021)=
## What makes ML workloads fast? · 21

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 21: What makes ML workloads fast?](pages/page-021.webp)


(cs336-05-page-022)=
## How do we make GPUs go fast? · 22

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 22: How do we make GPUs go fast?](pages/page-022.webp)


(cs336-05-page-023)=
## Control divergence (not a memory issue) · 23

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 23: Control divergence (not a memory issue)](pages/page-023.webp)


(cs336-05-page-024)=
## Trick 1: Low precision computation · 24

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 24: Trick 1: Low precision computation](pages/page-024.webp)


(cs336-05-page-025)=
## Low precision improves arithmetic intensity · 25

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 25: Low precision improves arithmetic intensity](pages/page-025.webp)


(cs336-05-page-026)=
## Low precision drives faster matrix multiplies · 26

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 26: Low precision drives faster matrix multiplies](pages/page-026.webp)


(cs336-05-page-027)=
## Frontiers in low precision · 27

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 27: Frontiers in low precision](pages/page-027.webp)


(cs336-05-page-028)=
## MXFP8 training in practice · 28

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 28: MXFP8 training in practice](pages/page-028.webp)


(cs336-05-page-029)=
## Frontiers in low precision · 29

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 29: Frontiers in low precision](pages/page-029.webp)


(cs336-05-page-030)=
## Trick 2: Operator fusion · 30

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 30: Trick 2: Operator fusion](pages/page-030.webp)


(cs336-05-page-031)=
## Operator fusion to minimize memory access · 31

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 31: Operator fusion to minimize memory access](pages/page-031.webp)


(cs336-05-page-032)=
## Example – sines and cosines · 32

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 32: Example – sines and cosines](pages/page-032.webp)


(cs336-05-page-033)=
## Fusion example · 33

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 33: Fusion example](pages/page-033.webp)


(cs336-05-page-034)=
## Trick 3: recomputation · 34

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 34: Trick 3: recomputation](pages/page-034.webp)


(cs336-05-page-035)=
## Storing (and retrieving) activations can be expensive! · 35

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 35: Storing (and retrieving) activations can be expensive!](pages/page-035.webp)


(cs336-05-page-036)=
## Throw away the activations, re-compute them! · 36

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 36: Throw away the activations, re-compute them!](pages/page-036.webp)


(cs336-05-page-037)=
## Trick (?) 4: Memory coalescing and DRAM · 37

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 37: Trick (?) 4: Memory coalescing and DRAM](pages/page-037.webp)


(cs336-05-page-038)=
## Memory coalescing · 38

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 38: Memory coalescing](pages/page-038.webp)


(cs336-05-page-039)=
## Coalescing for matrix multiplication · 39

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 39: Coalescing for matrix multiplication](pages/page-039.webp)


(cs336-05-page-040)=
## Trick 5 (the big one): tiling · 40

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 40: Trick 5 (the big one): tiling](pages/page-040.webp)


(cs336-05-page-041)=
## Tiling – store and reuse information in shared memory · 41

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 41: Tiling – store and reuse information in shared memory](pages/page-041.webp)


(cs336-05-page-042)=
## Tiling math · 42

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 42: Tiling math](pages/page-042.webp)


(cs336-05-page-043)=
## Complexities with tiling · 43

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 43: Complexities with tiling](pages/page-043.webp)


(cs336-05-page-044)=
## Complexities with tiling 2 – memory alignment · 44

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 44: Complexities with tiling 2 – memory alignment](pages/page-044.webp)


(cs336-05-page-045)=
## Putting it together: understanding a matrix mystery · 45

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 45: Putting it together: understanding a matrix mystery](pages/page-045.webp)


(cs336-05-page-046)=
## Matrix mystery · 46

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 46: Matrix mystery](pages/page-046.webp)


(cs336-05-page-047)=
## Part 1: tiling · 47

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 47: Part 1: tiling](pages/page-047.webp)


(cs336-05-page-048)=
## Part 2: wave quantization · 48

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 48: Part 2: wave quantization](pages/page-048.webp)


(cs336-05-page-049)=
## Recap of part 2: making ML workloads go fast · 49

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 49: Recap of part 2: making ML workloads go fast](pages/page-049.webp)


(cs336-05-page-050)=
## Part 3: Using what we know to understand Flash Attention · 50

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 50: Part 3: Using what we know to understand Flash Attention](pages/page-050.webp)


(cs336-05-page-051)=
## Recap of attention computation · 51

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 51: Recap of attention computation](pages/page-051.webp)


(cs336-05-page-052)=
## Tiling part 1: tiling for the KQV matrix multiply · 52

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 52: Tiling part 1: tiling for the KQV matrix multiply](pages/page-052.webp)


(cs336-05-page-053)=
## Tiling part 2: incremental computation of the softmax · 53

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 53: Tiling part 2: incremental computation of the softmax](pages/page-053.webp)


(cs336-05-page-054)=
## Putting it all together – the forward pass of flash attention · 54

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 54: Putting it all together – the forward pass of flash attention](pages/page-054.webp)


(cs336-05-page-055)=
## Recap for the whole lecture · 55

:::{hints}
slides:
  class: cs336-pdf-page
:::

<style>
:global(.slidev-layout.cs336-pdf-page) { padding: 0; }
:global(.cs336-pdf-page .pm-book__chapter),
:global(.cs336-pdf-page .pm-book-footer),
:global(.cs336-pdf-page .pm-slide-section > h1) { display: none; }
:global(.cs336-pdf-page .pm-book__content),
:global(.cs336-pdf-page .pm-block),
:global(.cs336-pdf-page .pm-block > p) { height: 100%; margin: 0; }
:global(.cs336-pdf-page .pm-block img) { width: 100%; height: 100%; object-fit: contain; }
</style>







![Lecture 5, page 55: Recap for the whole lecture](pages/page-055.webp)

