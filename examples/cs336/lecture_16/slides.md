---
title: "CS336 Lecture 16: Post-training II: reinforcement learning from verifiable rewards"
lang: en
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-content'
renderers:
  slides: {}
---

(cs336-16-cover)=
# Lecture 16: Post-training II: reinforcement learning from verifiable rewards

Stanford CS336 · Language Modeling from Scratch · Spring 2026.




(cs336-16-page-001)=
## Lecture 16 · 1

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







![Lecture 16, page 1: Lecture 16](pages/page-001.webp)


(cs336-16-page-002)=
## The class thus far · 2

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







![Lecture 16, page 2: The class thus far](pages/page-002.webp)


(cs336-16-page-003)=
## The goal – expand the scope and power of RL · 3

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







![Lecture 16, page 3: The goal – expand the scope and power of RL](pages/page-003.webp)


(cs336-16-page-004)=
## The lecture today · 4

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







![Lecture 16, page 4: The lecture today](pages/page-004.webp)


(cs336-16-page-005)=
## Recap: PPO in theory · 5

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







![Lecture 16, page 5: Recap: PPO in theory](pages/page-005.webp)


(cs336-16-page-006)=
## PPO · 6

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







![Lecture 16, page 6: PPO](pages/page-006.webp)


(cs336-16-page-007)=
## PPO – at a conceptual level · 7

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







![Lecture 16, page 7: PPO – at a conceptual level](pages/page-007.webp)


(cs336-16-page-008)=
## PPO in practice · 8

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







![Lecture 16, page 8: PPO in practice](pages/page-008.webp)


(cs336-16-page-009)=
## PPO – idealization (?) for language models · 9

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







![Lecture 16, page 9: PPO – idealization (?) for language models](pages/page-009.webp)


(cs336-16-page-010)=
## PPO – let’s look at an implementation · 10

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







![Lecture 16, page 10: PPO – let’s look at an implementation](pages/page-010.webp)


(cs336-16-page-011)=
## PPO in practice · 11

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







![Lecture 16, page 11: PPO in practice](pages/page-011.webp)


(cs336-16-page-012)=
## PPO in practice – loss computation · 12

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







![Lecture 16, page 12: PPO in practice – loss computation](pages/page-012.webp)


(cs336-16-page-013)=
## PPO in practice – rollouts. · 13

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







![Lecture 16, page 13: PPO in practice – rollouts.](pages/page-013.webp)


(cs336-16-page-014)=
## PPO in practice – reward shaping · 14

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







![Lecture 16, page 14: PPO in practice – reward shaping](pages/page-014.webp)


(cs336-16-page-015)=
## PPO in practice – generalized advantage estimate · 15

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







![Lecture 16, page 15: PPO in practice – generalized advantage estimate](pages/page-015.webp)


(cs336-16-page-016)=
## What do you expect to see in PPO? · 16

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







![Lecture 16, page 16: What do you expect to see in PPO?](pages/page-016.webp)


(cs336-16-page-017)=
## Why do we need yet another RL algorithm..? · 17

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







![Lecture 16, page 17: Why do we need yet another RL algorithm..?](pages/page-017.webp)


(cs336-16-page-018)=
## New kid on the block: GRPO · 18

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







![Lecture 16, page 18: New kid on the block: GRPO](pages/page-018.webp)


(cs336-16-page-019)=
## GRPO is very simple (thanks to lack of value function..) · 19

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







![Lecture 16, page 19: GRPO is very simple (thanks to lack of value function..)](pages/page-019.webp)


(cs336-16-page-020)=
## Advantage computation is also very simple.. · 20

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







![Lecture 16, page 20: Advantage computation is also very simple..](pages/page-020.webp)


(cs336-16-page-021)=
## How well does it work? · 21

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







![Lecture 16, page 21: How well does it work?](pages/page-021.webp)


(cs336-16-page-022)=
## Thinking carefully about the GRPO objective.. · 22

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







![Lecture 16, page 22: Thinking carefully about the GRPO objective..](pages/page-022.webp)


(cs336-16-page-023)=
## GRPO doesn’t use a “valid” baseline · 23

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







![Lecture 16, page 23: GRPO doesn’t use a “valid” baseline](pages/page-023.webp)


(cs336-16-page-024)=
## Length biases of GRPO · 24

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







![Lecture 16, page 24: Length biases of GRPO](pages/page-024.webp)


(cs336-16-page-025)=
## Case studies · 25

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







![Lecture 16, page 25: Case studies](pages/page-025.webp)


(cs336-16-page-026)=
## Deepseek R1 · 26

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







![Lecture 16, page 26: Deepseek R1](pages/page-026.webp)


(cs336-16-page-027)=
## Algorithm - GRPO · 27

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







![Lecture 16, page 27: Algorithm - GRPO](pages/page-027.webp)


(cs336-16-page-028)=
## Controlled setting – R1 zero. · 28

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







![Lecture 16, page 28: Controlled setting – R1 zero.](pages/page-028.webp)


(cs336-16-page-029)=
## Interesting phenomena (?) · 29

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







![Lecture 16, page 29: Interesting phenomena (?)](pages/page-029.webp)


(cs336-16-page-030)=
## But maybe a bit overstated · 30

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







![Lecture 16, page 30: But maybe a bit overstated](pages/page-030.webp)


(cs336-16-page-031)=
## Pushing performance further – R1 · 31

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







![Lecture 16, page 31: Pushing performance further – R1](pages/page-031.webp)


(cs336-16-page-032)=
## SFT initialization.. · 32

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







![Lecture 16, page 32: SFT initialization..](pages/page-032.webp)


(cs336-16-page-033)=
## SFT for reasoning / math.. · 33

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







![Lecture 16, page 33: SFT for reasoning / math..](pages/page-033.webp)


(cs336-16-page-034)=
## RL step · 34

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







![Lecture 16, page 34: RL step](pages/page-034.webp)


(cs336-16-page-035)=
## SFT/RLHF · 35

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







![Lecture 16, page 35: SFT/RLHF](pages/page-035.webp)


(cs336-16-page-036)=
## How well does R1 work? · 36

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







![Lecture 16, page 36: How well does R1 work?](pages/page-036.webp)


(cs336-16-page-037)=
## Distillation – can we get non-reasoning models to reason? · 37

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







![Lecture 16, page 37: Distillation – can we get non-reasoning models to reason?](pages/page-037.webp)


(cs336-16-page-038)=
## Other, relevant observations · 38

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







![Lecture 16, page 38: Other, relevant observations](pages/page-038.webp)


(cs336-16-page-039)=
## Kimi K1.5 · 39

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







![Lecture 16, page 39: Kimi K1.5](pages/page-039.webp)


(cs336-16-page-040)=
## Long COT reasoning strategy · 40

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







![Lecture 16, page 40: Long COT reasoning strategy](pages/page-040.webp)


(cs336-16-page-041)=
## Data curation + SFT · 41

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







![Lecture 16, page 41: Data curation + SFT](pages/page-041.webp)


(cs336-16-page-042)=
## Kimi RL · 42

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







![Lecture 16, page 42: Kimi RL](pages/page-042.webp)


(cs336-16-page-043)=
## Length control in Kimi · 43

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







![Lecture 16, page 43: Length control in Kimi](pages/page-043.webp)


(cs336-16-page-044)=
## Additional details · 44

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







![Lecture 16, page 44: Additional details](pages/page-044.webp)


(cs336-16-page-045)=
## RL Infra · 45

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







![Lecture 16, page 45: RL Infra](pages/page-045.webp)


(cs336-16-page-046)=
## Kimi’s RL setup in detail · 46

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







![Lecture 16, page 46: Kimi’s RL setup in detail](pages/page-046.webp)


(cs336-16-page-047)=
## Scaling results · 47

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







![Lecture 16, page 47: Scaling results](pages/page-047.webp)


(cs336-16-page-048)=
## Ablation / comparison to expert iteration · 48

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







![Lecture 16, page 48: Ablation / comparison to expert iteration](pages/page-048.webp)


(cs336-16-page-049)=
## Final case study – Qwen 3 · 49

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







![Lecture 16, page 49: Final case study – Qwen 3](pages/page-049.webp)


(cs336-16-page-050)=
## Overall picture · 50

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







![Lecture 16, page 50: Overall picture](pages/page-050.webp)


(cs336-16-page-051)=
## SFT + Reasoning RL · 51

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







![Lecture 16, page 51: SFT + Reasoning RL](pages/page-051.webp)


(cs336-16-page-052)=
## Qwen 3 specific new stuff. · 52

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







![Lecture 16, page 52: Qwen 3 specific new stuff.](pages/page-052.webp)


(cs336-16-page-053)=
## Test time scaling · 53

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







![Lecture 16, page 53: Test time scaling](pages/page-053.webp)


(cs336-16-page-054)=
## Composition of the different stages · 54

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







![Lecture 16, page 54: Composition of the different stages](pages/page-054.webp)


(cs336-16-page-055)=
## Agentic RL · 55

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







![Lecture 16, page 55: Agentic RL](pages/page-055.webp)


(cs336-16-page-056)=
## Midtraining · 56

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







![Lecture 16, page 56: Midtraining](pages/page-056.webp)


(cs336-16-page-057)=
## Expert models · 57

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







![Lecture 16, page 57: Expert models](pages/page-057.webp)


(cs336-16-page-058)=
## Web dev / UX / QA expert · 58

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







![Lecture 16, page 58: Web dev / UX / QA expert](pages/page-058.webp)


(cs336-16-page-059)=
## Agent environment construction · 59

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







![Lecture 16, page 59: Agent environment construction](pages/page-059.webp)


(cs336-16-page-060)=
## Agent RL · 60

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







![Lecture 16, page 60: Agent RL](pages/page-060.webp)


(cs336-16-page-061)=
## Recap for today · 61

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







![Lecture 16, page 61: Recap for today](pages/page-061.webp)

