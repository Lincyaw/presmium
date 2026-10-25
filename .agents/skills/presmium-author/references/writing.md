# Organizing content and presentation steps

Use this when writing a new lecture, restructuring one, or fixing a lecture that reads well on the web but is hard to present. Directive options are in the [directive reference](directives.md).

## Let the reader keep up

State in one sentence the question a section answers, then give the example, the evidence and the explanation. Narration must read on its own; projected content must be legible at the current step. Do not move whole paragraphs of narration onto the screen to fill a slide.

Keep the existing frontmatter. A minimal new lecture:

````md
---
title: Introduction to tokenization
contentModel: blocks
lang: en
renderers:
  web: {}
  slides: {}
---

# Introduction to tokenization

This lecture explains how text becomes the tokens a model uses.

(merge)=
## Why merge

First look at the fragments that repeat.

:::{slide}
- Count adjacent fragments
- Merge the most frequent pair
:::

:::{narration}
:at: 0
:mode: during

Count first, then merge. Each merge changes what the next count sees.
:::

:::{slide}
:reveal:
After a merge, count again.
:::

:::{narration}
:at: 1
:mode: after

This paragraph is spoken after the summary appears.
:::
````

`lang` sets the language of the product's interface and of text written at compile time; the default is `zh-CN`. The official plugins and the three basic renderers (`web`, `slides`, `notebook`) are installed with `presmium`; to use a plugin's directives, still list the package that provides it under `plugins` in the frontmatter.

## Sections

- `#` is the lecture title or a chapter heading; `##` starts a section. `sectionDepth` in the frontmatter changes the section heading level of an existing lecture.
- Content before the first `##` is the cover section.
- A section is one slide, one section of the web page, and a group of notebook cells starting with its heading.

## Narration and projected content

New lectures declare `contentModel: blocks` in the entry frontmatter. Plain paragraphs, lists and quotes
are body blocks (`role: visual`), editable on the BlockNote canvas. Only explicit `{narration}` becomes
speech or captions; bind it to `:at: N` and choose `:mode: during` or `after`. The step panel edits that
narration while the document canvas edits the body. Save both through MyST, never a separate BlockNote file.

The following table describes the implicit narration model retained for existing lectures without
`contentModel: blocks`. Keep an existing lecture's model unless the user requests a conversion.

Every block in a section is either **narration** or **projected content** (role `narration` or `visual` in the IR):

| Block | Role |
|---|---|
| Plain paragraphs, lists, block quotes | Narration |
| Content wrapped in `:::{slide}` | Projected |
| Code blocks, `{code-ref}`, images, tables, math, diagrams, plugin directives | Projected |

How each medium shows them:

| Medium | Projected content | Narration |
|---|---|---|
| Web | In source order | In source order, as body text |
| Slides | On the slide | In the presenter window, split by step; speaker notes in an exported PowerPoint |
| Notebook | Markdown or code cells | Markdown cells |

Wrap text that must be projected in `{slide}`. Both kinds appear on the web page.

## Steps: what appears when, and which narration belongs to which step

Steps count from 0. The rules:

1. Projected content is visible from step 0 by default.
2. `:reveal:` on a block makes it appear at the next step. On `{slide}` or `{only}`, `:reveal:` acts on everything inside: the whole block appears as one unit at the next step.
3. `:reveal: items` on `{slide}` or `{only}` reveals the list inside one item per step.
4. `:at: N` on `{slide}` or `{only}` shows the content from step N; `:until: M` hides it at step M. Both are non-negative integers, `until` must be greater than the start step, and `at` cannot be combined with `reveal`. Forward and backward navigation use the same visible range. The reading form (the web document view) shows all content; the presentation shows only the current range. To replace one result with the next, write `:at: 0` and `:until: 1` on the first and `:at: 1` on the second; no component or player is needed.
5. A block that spans several steps has `span + 1` internal states; state k (from 0) shows at step `at + k`:
   - `{code-ref}` with `:steps: a, b, c` highlights the three units at `at`, `at + 1`, `at + 2`; `span` is 2.
   - A list with `:reveal: items` shows the first item at `at` and one more item at each later step; `span` is the number of items minus one.
   - A `{scene}` has one state per entry of `:durations:`; `span` is the count minus one.
   - A component declares its internal steps with `:span:`.
6. A multi-step block without `:reveal:` starts at the last step used so far, so its internal steps come after the blocks already shown.
7. In the legacy implicit model, narration binds to the nearest projected block before it: the 1st paragraph belongs to the step at which that block appears (`at`), the 2nd to `at + 1`, and so on. Paragraphs beyond `span` all belong to the last step, `at + span`. For a block with `span` 0, all following narration belongs to `at`. So you can write one paragraph of narration per step.
8. Narration before the first projected block belongs to step 0.

Example: a list with `:reveal: items` of three items followed by three paragraphs gives one paragraph per item; a fourth paragraph stays on the last item.

After editing, step forward and backward through the section. If narration lands on the wrong step, run `presmium ir`, find the section, and check each block's `role`, `at` and `span` (and the section's `steps`); then fix the source, not the IR.

## Stable positions

Write a stable label before a section with `(merge)=`; blocks can also take a label or `:label:`. Section labels are unique in the lecture, block labels unique in their section. Without a label the section ID is generated from the heading and changes when the heading does; generated block IDs change when content is inserted. Published links, notes and lecture tracks depend on these IDs, so keep the label when you change a heading.

Use `{include}` for multi-file lectures; the path is relative to the file that contains the directive. An included file's frontmatter does not override the entry's. Code anchors use a different path rule; see [Code references and execution](code.md).

Cross-reference with the MyST roles `{ref}`, `{numref}`, `{eq}`; `presmium check` reports missing targets. Name a position before you reference it.

## When a form has no room or does not apply

First cut what a slide says, then decide whether to split the section. `{hints}` sets a slide's zoom (`zoom`), layout (`layout`: `default`, `cover`, `center`, `full`) and class (`class`), or a scrolling layout on the web. A slide whose content overflows the canvas is scaled down as a whole; still cut first.

Restrict content to media with `{only}`, e.g. `{only} web, notebook`. Each renderer receives only its own blocks, and steps are compressed per renderer: steps taken by blocks shown only elsewhere do not exist in this renderer, and later steps move up. Check the order on both sides. `{only} lecture` holds text that is only spoken in the synthesized lecture; narration in `{only} web, slides` is shown but not spoken.

Teacher-only content is audience filtering, not a media restriction; see [Publishing and reproduction](publishing.md).

For quizzes, exercises, predict-then-reveal or media, first check the [directive reference](directives.md) for an existing directive. Build a component only when new interaction logic is needed.

For precise speech alignment use `{narration}` with an explicit `:at:` and `:mode: during|after` (see the directive reference). In the workbench, click a document’s page/step icon or the captions icon in presentation to edit the selected step. Animation step buttons and the presentation step menu jump directly to the editing target; there is no need to advance through every earlier step.
