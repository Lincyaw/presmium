---
title: "CS336 Lecture 08: Parallelism basics"
lang: en
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-content'
renderers:
  slides: {}
---

(cs336-08-cover)=
# Lecture 08: Parallelism basics

Stanford CS336 · Language Modeling from Scratch · Spring 2026.




(cs336-08-page-001)=
## Lecture 8 · 1

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







![Lecture 8, page 1: Lecture 8](pages/page-001.webp)


(cs336-08-page-002)=
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







![Lecture 8, page 2: Outline and goals](pages/page-002.webp)


(cs336-08-page-003)=
## Organization today: · 3

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







![Lecture 8, page 3: Organization today:](pages/page-003.webp)


(cs336-08-page-004)=
## Limits to GPU-based scaling – compute · 4

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







![Lecture 8, page 4: Limits to GPU-based scaling – compute](pages/page-004.webp)


(cs336-08-page-005)=
## Limits to GPU-based scaling - memory · 5

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







![Lecture 8, page 5: Limits to GPU-based scaling - memory](pages/page-005.webp)


(cs336-08-page-006)=
## What do we do? Multi-GPU, multi-machine parallelism · 6

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







![Lecture 8, page 6: What do we do? Multi-GPU, multi-machine parallelism](pages/page-006.webp)


(cs336-08-page-007)=
## But first.. Some basics about collective communication · 7

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







![Lecture 8, page 7: But first.. Some basics about collective communication](pages/page-007.webp)


(cs336-08-page-008)=
## Important detail – all reduce vs reduce-scatter-gather. · 8

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







![Lecture 8, page 8: Important detail – all reduce vs reduce-scatter-gather.](pages/page-008.webp)


(cs336-08-page-009)=
## TPUs vs GPUs – design differences at the comm level · 9

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







![Lecture 8, page 9: TPUs vs GPUs – design differences at the comm level](pages/page-009.webp)


(cs336-08-page-010)=
## Mesh vs tree vs other · 10

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







![Lecture 8, page 10: Mesh vs tree vs other](pages/page-010.webp)


(cs336-08-page-011)=
## But then things change.. TPU8i/t · 11

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







![Lecture 8, page 11: But then things change.. TPU8i/t](pages/page-011.webp)


(cs336-08-page-012)=
## Why not connect everything? · 12

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







![Lecture 8, page 12: Why not connect everything?](pages/page-012.webp)


(cs336-08-page-013)=
## Part 1 recap · 13

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







![Lecture 8, page 13: Part 1 recap](pages/page-013.webp)


(cs336-08-page-014)=
## Part 2 – Standard LLM parallelization primitives · 14

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







![Lecture 8, page 14: Part 2 – Standard LLM parallelization primitives](pages/page-014.webp)


(cs336-08-page-015)=
## Naïve data parallelism · 15

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







![Lecture 8, page 15: Naïve data parallelism](pages/page-015.webp)


(cs336-08-page-016)=
## What’s wrong with naïve data parallel? · 16

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







![Lecture 8, page 16: What’s wrong with naïve data parallel?](pages/page-016.webp)


(cs336-08-page-017)=
## What’s wrong with naïve data parallelism? - Memory · 17

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







![Lecture 8, page 17: What’s wrong with naïve data parallelism? - Memory](pages/page-017.webp)


(cs336-08-page-018)=
## ZeRO – solving the memory overhead issue of DP · 18

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







![Lecture 8, page 18: ZeRO – solving the memory overhead issue of DP](pages/page-018.webp)


(cs336-08-page-019)=
## ZeRO stage 1. optimizer state sharding · 19

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







![Lecture 8, page 19: ZeRO stage 1. optimizer state sharding](pages/page-019.webp)


(cs336-08-page-020)=
## ZeRO stage 1. how it works · 20

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







![Lecture 8, page 20: ZeRO stage 1. how it works](pages/page-020.webp)


(cs336-08-page-021)=
## Comparing ZeRO stage 1 and naïve data parallel · 21

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







![Lecture 8, page 21: Comparing ZeRO stage 1 and naïve data parallel](pages/page-021.webp)


(cs336-08-page-022)=
## ZeRO stage 2. the simple extension to gradient sharding · 22

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







![Lecture 8, page 22: ZeRO stage 2. the simple extension to gradient sharding](pages/page-022.webp)


(cs336-08-page-023)=
## ZeRO stage 2. how it works · 23

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







![Lecture 8, page 23: ZeRO stage 2. how it works](pages/page-023.webp)


(cs336-08-page-024)=
## ZeRO stage 3 (aka FSDP) shard everything · 24

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







![Lecture 8, page 24: ZeRO stage 3 (aka FSDP) shard everything](pages/page-024.webp)


(cs336-08-page-025)=
## ZeRO stage 3 (aka FSDP) how it works (baby version) · 25

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







![Lecture 8, page 25: ZeRO stage 3 (aka FSDP) how it works (baby version)](pages/page-025.webp)


(cs336-08-page-026)=
## Actual picture of how FDSP / ZeRO stage 3 works · 26

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







![Lecture 8, page 26: Actual picture of how FDSP / ZeRO stage 3 works](pages/page-026.webp)


(cs336-08-page-027)=
## What’s the point? · 27

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







![Lecture 8, page 27: What’s the point?](pages/page-027.webp)


(cs336-08-page-028)=
## ZeRO in practice: will it fit? · 28

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







![Lecture 8, page 28: ZeRO in practice: will it fit?](pages/page-028.webp)


(cs336-08-page-029)=
## Issues remain with data parallel – compute scaling · 29

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







![Lecture 8, page 29: Issues remain with data parallel – compute scaling](pages/page-029.webp)


(cs336-08-page-030)=
## Issues remain with data parallel – models don’t fit · 30

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







![Lecture 8, page 30: Issues remain with data parallel – models don’t fit](pages/page-030.webp)


(cs336-08-page-031)=
## Beyond data parallel – model parallelism · 31

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







![Lecture 8, page 31: Beyond data parallel – model parallelism](pages/page-031.webp)


(cs336-08-page-032)=
## Layer-wise parallel · 32

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







![Lecture 8, page 32: Layer-wise parallel](pages/page-032.webp)


(cs336-08-page-033)=
## What’s wrong with layer-wise parallel · 33

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







![Lecture 8, page 33: What’s wrong with layer-wise parallel](pages/page-033.webp)


(cs336-08-page-034)=
## A solution: pipeline parallel · 34

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







![Lecture 8, page 34: A solution: pipeline parallel](pages/page-034.webp)


(cs336-08-page-035)=
## Why pipeline parallel? · 35

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







![Lecture 8, page 35: Why pipeline parallel?](pages/page-035.webp)


(cs336-08-page-036)=
## Pipeline performance is highly dependent on batch size · 36

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







![Lecture 8, page 36: Pipeline performance is highly dependent on batch size](pages/page-036.webp)


(cs336-08-page-037)=
## Trading communication bandwidth for utilization · 37

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







![Lecture 8, page 37: Trading communication bandwidth for utilization](pages/page-037.webp)


(cs336-08-page-038)=
## ‘Zero bubble’ pipelining · 38

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







![Lecture 8, page 38: ‘Zero bubble’ pipelining](pages/page-038.webp)


(cs336-08-page-039)=
## Model parallel along the width axes · 39

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







![Lecture 8, page 39: Model parallel along the width axes](pages/page-039.webp)


(cs336-08-page-040)=
## Tensor parallel – GPUs have submatrices · 40

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







![Lecture 8, page 40: Tensor parallel – GPUs have submatrices](pages/page-040.webp)


(cs336-08-page-041)=
## Row vs Column tensor parallel · 41

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







![Lecture 8, page 41: Row vs Column tensor parallel](pages/page-041.webp)


(cs336-08-page-042)=
## When do we tensor parallel? · 42

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







![Lecture 8, page 42: When do we tensor parallel?](pages/page-042.webp)


(cs336-08-page-043)=
## Tensor parallel – pros and cons vs pipeline parallel · 43

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







![Lecture 8, page 43: Tensor parallel – pros and cons vs pipeline parallel](pages/page-043.webp)


(cs336-08-page-044)=
## A final complexity – memory is dynamic! · 44

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







![Lecture 8, page 44: A final complexity – memory is dynamic!](pages/page-044.webp)


(cs336-08-page-045)=
## A final complexity – activation memory · 45

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







![Lecture 8, page 45: A final complexity – activation memory](pages/page-045.webp)


(cs336-08-page-046)=
## What’s the activation memory per layer? · 46

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







![Lecture 8, page 46: What’s the activation memory per layer?](pages/page-046.webp)


(cs336-08-page-047)=
## Activation under tensor parallel · 47

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







![Lecture 8, page 47: Activation under tensor parallel](pages/page-047.webp)


(cs336-08-page-048)=
## Making memory truly linear – sequence parallel · 48

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







![Lecture 8, page 48: Making memory truly linear – sequence parallel](pages/page-048.webp)


(cs336-08-page-049)=
## Making activation memory fully scale with more machines · 49

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







![Lecture 8, page 49: Making activation memory fully scale with more machines](pages/page-049.webp)


(cs336-08-page-050)=
## Expert parallelism · 50

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







![Lecture 8, page 50: Expert parallelism](pages/page-050.webp)


(cs336-08-page-051)=
## Why EP? · 51

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







![Lecture 8, page 51: Why EP?](pages/page-051.webp)


(cs336-08-page-052)=
## Complexity – combining EP and others · 52

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







![Lecture 8, page 52: Complexity – combining EP and others](pages/page-052.webp)


(cs336-08-page-053)=
## Complexity: Decoupling attention / expert parallelism · 53

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







![Lecture 8, page 53: Complexity: Decoupling attention / expert parallelism](pages/page-053.webp)


(cs336-08-page-054)=
## Other parallelism strategies · 54

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







![Lecture 8, page 54: Other parallelism strategies](pages/page-054.webp)


(cs336-08-page-055)=
## Recap: LLM parallelism table · 55

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







![Lecture 8, page 55: Recap: LLM parallelism table](pages/page-055.webp)


(cs336-08-page-056)=
## Model vs Tensor parallel (TPU book) · 56

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







![Lecture 8, page 56: Model vs Tensor parallel (TPU book)](pages/page-056.webp)


(cs336-08-page-057)=
## ‘3D (4D) parallelism’ – putting it all together · 57

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







![Lecture 8, page 57: ‘3D (4D) parallelism’ – putting it all together](pages/page-057.webp)


(cs336-08-page-058)=
## Example from Metagron’s current recommendations · 58

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







![Lecture 8, page 58: Example from Metagron’s current recommendations](pages/page-058.webp)


(cs336-08-page-059)=
## Scaling strategies from Narayanan 2021 · 59

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







![Lecture 8, page 59: Scaling strategies from Narayanan 2021](pages/page-059.webp)


(cs336-08-page-060)=
## Careful ‘3D’ parallelism gives linear gains · 60

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







![Lecture 8, page 60: Careful ‘3D’ parallelism gives linear gains](pages/page-060.webp)


(cs336-08-page-061)=
## Tensor parallel = 8 is often optimal · 61

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







![Lecture 8, page 61: Tensor parallel = 8 is often optimal](pages/page-061.webp)


(cs336-08-page-062)=
## Activation recomputation can pay for itself (via memory) · 62

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







![Lecture 8, page 62: Activation recomputation can pay for itself (via memory)](pages/page-062.webp)


(cs336-08-page-063)=
## Recent LMs – what do they do? · 63

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







![Lecture 8, page 63: Recent LMs – what do they do?](pages/page-063.webp)


(cs336-08-page-064)=
## DeepSeek · 64

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







![Lecture 8, page 64: DeepSeek](pages/page-064.webp)


(cs336-08-page-065)=
## Yi · 65

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







![Lecture 8, page 65: Yi](pages/page-065.webp)


(cs336-08-page-066)=
## Llama3 405B · 66

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







![Lecture 8, page 66: Llama3 405B](pages/page-066.webp)


(cs336-08-page-067)=
## Llama 3 405B · 67

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







![Lecture 8, page 67: Llama 3 405B](pages/page-067.webp)


(cs336-08-page-068)=
## Gemma 2 · 68

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







![Lecture 8, page 68: Gemma 2](pages/page-068.webp)


(cs336-08-page-069)=
## Mixtral 8x22B · 69

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







![Lecture 8, page 69: Mixtral 8x22B](pages/page-069.webp)


(cs336-08-page-070)=
## Nemotron 3 Super 120B-A12B · 70

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







![Lecture 8, page 70: Nemotron 3 Super 120B-A12B](pages/page-070.webp)


(cs336-08-page-071)=
## Qwen 3 · 71

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







![Lecture 8, page 71: Qwen 3](pages/page-071.webp)


(cs336-08-page-072)=
## Overview table of model parallelism · 72

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







![Lecture 8, page 72: Overview table of model parallelism](pages/page-072.webp)


(cs336-08-page-073)=
## Recap for the whole lecture · 73

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







![Lecture 8, page 73: Recap for the whole lecture](pages/page-073.webp)

