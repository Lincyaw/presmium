---
title: "CS336 Lecture 15: After pretraining: mid-training and post-training"
lang: en
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-content'
renderers:
  slides: {}
---

(cs336-15-cover)=
# Lecture 15: After pretraining: mid-training and post-training

Stanford CS336 · Language Modeling from Scratch · Spring 2026.




(cs336-15-page-001)=
## Lecture 15 · 1

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







![Lecture 15, page 1: Lecture 15](pages/page-001.webp)


(cs336-15-page-002)=
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







![Lecture 15, page 2: The class thus far](pages/page-002.webp)


(cs336-15-page-003)=
## Instruction following is a remarkable form of control · 3

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







![Lecture 15, page 3: Instruction following is a remarkable form of control](pages/page-003.webp)


(cs336-15-page-004)=
## Goal today: enable better, tighter controls over LM output · 4

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







![Lecture 15, page 4: Goal today: enable better, tighter controls over LM output](pages/page-004.webp)


(cs336-15-page-005)=
## Caveat: post-training information is pretty sparse! · 5

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







![Lecture 15, page 5: Caveat: post-training information is pretty sparse!](pages/page-005.webp)


(cs336-15-page-006)=
## Where today’s lecture fits in · 6

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







![Lecture 15, page 6: Where today’s lecture fits in](pages/page-006.webp)


(cs336-15-page-007)=
## What are the ingredients in SFT? · 7

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







![Lecture 15, page 7: What are the ingredients in SFT?](pages/page-007.webp)


(cs336-15-page-008)=
## Training data · 8

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







![Lecture 15, page 8: Training data](pages/page-008.webp)


(cs336-15-page-009)=
## Progression of SFT data (in the open world) · 9

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







![Lecture 15, page 9: Progression of SFT data (in the open world)](pages/page-009.webp)


(cs336-15-page-010)=
## FLAN – random examples · 10

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







![Lecture 15, page 10: FLAN – random examples](pages/page-010.webp)


(cs336-15-page-011)=
## Alpaca – random examples · 11

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







![Lecture 15, page 11: Alpaca – random examples](pages/page-011.webp)


(cs336-15-page-012)=
## O enAssistant – random exam les** **p p · 12

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







![Lecture 15, page 12: O enAssistant – random exam les** **p p](pages/page-012.webp)


(cs336-15-page-013)=
## Nemotron-SFT-O enCode-v1** **p · 13

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







![Lecture 15, page 13: Nemotron-SFT-O enCode-v1** **p](pages/page-013.webp)


(cs336-15-page-014)=
## What’s varying across these? · 14

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







![Lecture 15, page 14: What’s varying across these?](pages/page-014.webp)


(cs336-15-page-015)=
## What did we notice across the datasets?** These datasets vary in many ways… · 15

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







![Lecture 15, page 15: What did we notice across the datasets?** These datasets vary in many ways…](pages/page-015.webp)


(cs336-15-page-016)=
## Style variations in data and models · 16

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







![Lecture 15, page 16: Style variations in data and models](pages/page-016.webp)


(cs336-15-page-017)=
## When evaluating by preferences, style matters. · 17

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







![Lecture 15, page 17: When evaluating by preferences, style matters.](pages/page-017.webp)


(cs336-15-page-018)=
## What about benchmarks? · 18

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







![Lecture 15, page 18: What about benchmarks?](pages/page-018.webp)


(cs336-15-page-019)=
## References, complex knowledge, and factuality · 19

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







![Lecture 15, page 19: References, complex knowledge, and factuality](pages/page-019.webp)


(cs336-15-page-020)=
## Knowledge extraction and alignment · 20

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







![Lecture 15, page 20: Knowledge extraction and alignment](pages/page-020.webp)


(cs336-15-page-021)=
## Takeaways on knowledge extraction and alignment · 21

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







![Lecture 15, page 21: Takeaways on knowledge extraction and alignment](pages/page-021.webp)


(cs336-15-page-022)=
## Safety · 22

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







![Lecture 15, page 22: Safety](pages/page-022.webp)


(cs336-15-page-023)=
## Safety SFT in the wild · 23

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







![Lecture 15, page 23: Safety SFT in the wild](pages/page-023.webp)


(cs336-15-page-024)=
## Pipeline with most details · 24

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







![Lecture 15, page 24: Pipeline with most details](pages/page-024.webp)


(cs336-15-page-025)=
## Main safety approach – extract scenarios from users · 25

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







![Lecture 15, page 25: Main safety approach – extract scenarios from users](pages/page-025.webp)


(cs336-15-page-026)=
## Safety-tuning with just a little data · 26

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







![Lecture 15, page 26: Safety-tuning with just a little data](pages/page-026.webp)


(cs336-15-page-027)=
## Putting it together – SFT Data · 27

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







![Lecture 15, page 27: Putting it together – SFT Data](pages/page-027.webp)


(cs336-15-page-028)=
## How to fine-tune · 28

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







![Lecture 15, page 28: How to fine-tune](pages/page-028.webp)


(cs336-15-page-029)=
## Turning instruction tuning into pretraining · 29

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







![Lecture 15, page 29: Turning instruction tuning into pretraining](pages/page-029.webp)


(cs336-15-page-030)=
## ‘Midtraining’ / ‘Two-phase training’ · 30

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







![Lecture 15, page 30: ‘Midtraining’ / ‘Two-phase training’](pages/page-030.webp)


(cs336-15-page-031)=
## The second part of RLHF · 31

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







![Lecture 15, page 31: The second part of RLHF](pages/page-031.webp)


(cs336-15-page-032)=
## From imitation to optimization · 32

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







![Lecture 15, page 32: From imitation to optimization](pages/page-032.webp)


(cs336-15-page-033)=
## Why optimize? G-V gap · 33

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







![Lecture 15, page 33: Why optimize? G-V gap](pages/page-033.webp)


(cs336-15-page-034)=
## Overview · 34

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







![Lecture 15, page 34: Overview](pages/page-034.webp)


(cs336-15-page-035)=
## RLHF Data · 35

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







![Lecture 15, page 35: RLHF Data](pages/page-035.webp)


(cs336-15-page-036)=
## RLHF and data – standard setups · 36

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







![Lecture 15, page 36: RLHF and data – standard setups](pages/page-036.webp)


(cs336-15-page-037)=
## RLHF and data – instruct GPT guideline · 37

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







![Lecture 15, page 37: RLHF and data – instruct GPT guideline](pages/page-037.webp)


(cs336-15-page-038)=
## Another old example – bard annotations · 38

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







![Lecture 15, page 38: Another old example – bard annotations](pages/page-038.webp)


(cs336-15-page-039)=
## Modern worker distribution · 39

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







![Lecture 15, page 39: Modern worker distribution](pages/page-039.webp)


(cs336-15-page-040)=
## Large variation in compensation · 40

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







![Lecture 15, page 40: Large variation in compensation](pages/page-040.webp)


(cs336-15-page-041)=
## RLHF and data - crowdsourcing · 41

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







![Lecture 15, page 41: RLHF and data - crowdsourcing](pages/page-041.webp)


(cs336-15-page-042)=
## RLHF and data – crowdsourcing ethics · 42

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







![Lecture 15, page 42: RLHF and data – crowdsourcing ethics](pages/page-042.webp)


(cs336-15-page-043)=
## RLHF and data - demographics · 43

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







![Lecture 15, page 43: RLHF and data - demographics](pages/page-043.webp)


(cs336-15-page-044)=
## RLHF and style – annotators matter (a lot) · 44

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







![Lecture 15, page 44: RLHF and style – annotators matter (a lot)](pages/page-044.webp)


(cs336-15-page-045)=
## RLFH and data - LM-generated · 45

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







![Lecture 15, page 45: RLFH and data - LM-generated](pages/page-045.webp)


(cs336-15-page-046)=
## RLHF and data - LM-generated · 46

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







![Lecture 15, page 46: RLHF and data - LM-generated](pages/page-046.webp)


(cs336-15-page-047)=
## RLHF and data – Self-training · 47

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







![Lecture 15, page 47: RLHF and data – Self-training](pages/page-047.webp)


(cs336-15-page-048)=
## RLHF and style – Length effects · 48

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







![Lecture 15, page 48: RLHF and style – Length effects](pages/page-048.webp)


(cs336-15-page-049)=
## How do we RLHF? · 49

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







![Lecture 15, page 49: How do we RLHF?](pages/page-049.webp)


(cs336-15-page-050)=
## From imitation to optimization · 50

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







![Lecture 15, page 50: From imitation to optimization](pages/page-050.webp)


(cs336-15-page-051)=
## PPO in language modeling · 51

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







![Lecture 15, page 51: PPO in language modeling](pages/page-051.webp)


(cs336-15-page-052)=
## More details and background from Stiennon · 52

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







![Lecture 15, page 52: More details and background from Stiennon](pages/page-052.webp)


(cs336-15-page-053)=
## PPO – at a conceptual level · 53

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







![Lecture 15, page 53: PPO – at a conceptual level](pages/page-053.webp)


(cs336-15-page-054)=
## Can we get rid of PPO? · 54

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







![Lecture 15, page 54: Can we get rid of PPO?](pages/page-054.webp)


(cs336-15-page-055)=
## DPO – RLHF without tears? · 55

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







![Lecture 15, page 55: DPO – RLHF without tears?](pages/page-055.webp)


(cs336-15-page-056)=
## DPO – derivation from the RLHF formula · 56

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







![Lecture 15, page 56: DPO – derivation from the RLHF formula](pages/page-056.webp)


(cs336-15-page-057)=
## DPO derivation 2 · 57

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







![Lecture 15, page 57: DPO derivation 2](pages/page-057.webp)


(cs336-15-page-058)=
## DPO updates and components · 58

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







![Lecture 15, page 58: DPO updates and components](pages/page-058.webp)


(cs336-15-page-059)=
## DPO in LLaMA (and other open models) · 59

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







![Lecture 15, page 59: DPO in LLaMA (and other open models)](pages/page-059.webp)


(cs336-15-page-060)=
## Variants · 60

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







![Lecture 15, page 60: Variants](pages/page-060.webp)


(cs336-15-page-061)=
## But PPO does too (and sometimes better?) · 61

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







![Lecture 15, page 61: But PPO does too (and sometimes better?)](pages/page-061.webp)


(cs336-15-page-062)=
## Things to watch out for in RLHF · 62

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







![Lecture 15, page 62: Things to watch out for in RLHF](pages/page-062.webp)


(cs336-15-page-063)=
## Thins to watch out for - Overoptimization · 63

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







![Lecture 15, page 63: Thins to watch out for - Overoptimization](pages/page-063.webp)


(cs336-15-page-064)=
## Things to watch out for - mode collapse · 64

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







![Lecture 15, page 64: Things to watch out for - mode collapse](pages/page-064.webp)


(cs336-15-page-065)=
## Recap of the lecture · 65

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







![Lecture 15, page 65: Recap of the lecture](pages/page-065.webp)

