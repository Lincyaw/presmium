# Sections, steps and narration

Read this when you write a new document, restructure one, or fix a document that reads well on the web page but is hard to present (text missing from the slide, speaker notes on the wrong step). The options of each directive are in the [directive reference](directives.md).

## Terms

- **Document**: a folder with a `lecture.md` (the entry file) and the files it uses.
- **Section**: the part of the document under one `##` heading. It is one slide when presented.
- **Block**: one piece of content in a section: a paragraph, a list, a code block, an image, a table, a formula, a directive.
- **Directive**: a MyST block written ```` ```{name} ```` or `:::{name}`, such as `{slide}`.
- **On-screen content** and **narration**: every block is one or the other. On-screen content is shown on the slide; narration is the plain text, which becomes the speaker notes and is what a narrated lecture says.
- **Step**: a position inside a section when presenting. Pressing next moves one step; the first step of every section is step 0.
- **Form**: what a document is built into: the web page (`web`), the slides (`slides`), the notebook (`notebook`), the narrated lecture (`lecture`).

## Let the reader keep up

State in one sentence the question a section answers, then give the example, the evidence and the explanation. Narration must make sense when read on its own; on-screen content must be legible at each step. Do not copy whole paragraphs of narration onto the slide to fill it.

## A minimal document

When you edit an existing document, keep its frontmatter. A new one:

````md
---
title: Introduction to tokenization
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

Count first, then merge. Each merge changes what the next count sees.

:::{slide}
:reveal:
After a merge, count again.
:::

This paragraph is spoken when the summary is revealed.
````

What it does:

- The section "Why merge" has two steps. At step 0 the slide shows the two-item list; at step 1 "After a merge, count again." appears (`:reveal:`).
- The first two plain paragraphs are narration of step 0; the last paragraph is narration of step 1. On the web page all of it appears in source order.
- `(merge)=` gives the section a stable label (see "Stable labels" below).

Frontmatter keys used here:

- `title`: the document's title.
- `lang`: the language of the document. It selects the language of the built pages' interface and of text Presmium writes at build time. Default `zh-CN`.
- `renderers`: the forms to build, by id, each with its options (`{}` for none). `presmium build` without `--to` builds these.
- `plugins` (not needed in this example): the plugin packages whose directives the document uses. A directive from a plugin works only when its package is listed here.

The `web`, `slides` and `notebook` forms and the official plugins (`@lincyaw/addon-*`) are installed together with `presmium`; the `lecture` form comes from the plugin `@lincyaw/addon-lecture`. A listed plugin that is neither installed with `presmium` nor in the project gets the error `cannot load plugin "<name>": package not found`; install it with `pnpm add <package>`.

## Sections

- The first `#` heading is the document's title. Its section, the cover, holds everything before the first `##`.
- Each `##` heading starts a section.
- A later `#` heading starts a chapter: it is a section of its own (a chapter title slide), and the `##` sections after it belong to that chapter.
- One section is one slide, one part of the web page, and a group of notebook cells starting with its heading.
- To use another heading level for sections, set `sectionDepth` in the frontmatter (default `2`, meaning `##`). Change it only when an existing document is written with other heading levels.

## On-screen content and narration

Which blocks are which:

| Block | Kind |
|---|---|
| Plain paragraphs, plain lists, block quotes | Narration |
| Anything inside `:::{slide}` | On-screen content |
| Code blocks, `{code-ref}`, images, tables, math, diagrams, plugin directives | On-screen content |
| Anything inside `:::{only}` | Keeps its own kind: a plain paragraph there is still narration |

Note that a plain Markdown list is narration: it is not on the slide. To put text or a list on the slide, wrap it in `:::{slide}`.

How each form shows the two kinds:

| Form | On-screen content | Narration |
|---|---|---|
| Web page | In source order | In source order, as body text |
| Slides | On the slide | In the presenter window, split by step; the speaker notes of an exported PowerPoint |
| Notebook | Markdown or code cells | Markdown cells |
| Lecture | On the slide, as in the slides | Spoken over the slides, step by step |

## Steps

Each on-screen block gets a starting step, called `at`. A block that changes over several steps (a list revealed item by item, highlighted code, an animation) also has a `span`: the number of further steps it takes, so it occupies steps `at` to `at + span`. A block with `until` is hidden from step `until` on.

### When each on-screen block appears

1. A block with no step option appears at step 0.
2. `:reveal:` on a block makes it appear at the next step after everything placed so far. On `{slide}` or `{only}` it applies to the whole body: everything inside appears together, as one step.
3. A block that spans several steps and has no `:reveal:` starts at the last step placed so far, so its steps follow what is already shown. Blocks that span steps:
   - `:reveal: items` on `{slide}` or `{only}`: the list inside shows one item per step; `span` is the number of items minus one. Its first item appears at the last step placed so far, together with what is already on the slide.
   - `{code-ref}` with `:steps: a, b, c`: highlights unit `a`, then `b`, then `c`; `span` is 2.
   - `{scene}` (an animation, see the presmium-animate skill): one step per entry of `:durations:`; `span` is the count minus one.
   - `{component}`: the number of steps given by `:span:`.
4. `:at: N` on `{slide}` or `{only}` shows the body from step N; `:until: M` hides it from step M on. Both are whole numbers from 0; `until` must be greater than the starting step (otherwise the error `:until: must be greater than the block’s starting step`); `:at:` cannot be combined with `:reveal:`.
5. Going back shows exactly what going forward showed at that step.
6. The web page's document view shows all content regardless of steps; only the presentation shows the current step.

To replace one result with the next on the same slide, write `:at: 0` and `:until: 1` on the first `{slide}` and `:at: 1` on the second. No component or player is needed.

### Which step narration belongs to

1. Narration before the first on-screen block belongs to step 0.
2. Narration after an on-screen block belongs to that block (the nearest one above it). Its 1st paragraph belongs to the step at which the block appears (`at`), the 2nd to `at + 1`, and so on.
3. Paragraphs beyond the block's last step all belong to its last step (`at + span`). After a block with no span, all following narration belongs to `at`.

So write one paragraph of narration per step, right after the block it explains.

### Worked example

````md
## Merging

Intro.

:::{slide}
- one
- two
:::

N0.

:::{slide}
:reveal: items
- a
- b
- c
:::

P0.

P1.

P2.

P3.

:::{slide}
:reveal:
Summary.
:::

S0.
````

| Step | On the slide | Narration |
|---|---|---|
| 0 | list "one, two"; item "a" | Intro. N0. P0. |
| 1 | item "b" appears | P1. |
| 2 | item "c" appears | P2. P3. (beyond the list's last step) |
| 3 | "Summary." appears | S0. |

Item "a" appears at step 0 because `:reveal: items` starts at the last step placed so far (rule 3), which is still 0.

### Check the steps

After editing, step forward and backward through the section in the preview (`presmium dev --to slides`). If something lands on the wrong step, run `presmium ir`: it prints the compiled document as JSON. Find the section by its id (its label, or generated from its heading) and look at each block's `role` (`visual` for on-screen content, `narration` for narration), `at`, `span` and `until`. The section's `steps` is the number of its last step, so a section with `steps: 3` has steps 0 to 3. Fix the source, never the printed JSON.

## Stable labels

Write a label on its own line before a section heading, `(merge)=`, or before a block; a directive can also take `:label: merge`. Section labels must be unique in the document, block labels unique in their section.

Without a label, a section's id is generated from its heading and changes when the heading changes; a block's generated id (`list-2`, `code-1`) changes when content is inserted before it. Published links, class notes and recorded lectures point at these ids, so give a label to every section and block that something refers to, and keep the label when you change the heading.

Cross-reference with the MyST roles `{ref}`, `{numref}` and `{eq}`; `presmium check` reports a target that does not exist. Write the label before you reference it.

## Documents in several files

Use `{include}` to pull in another Markdown file; its path is relative to the file that contains the directive. An included file's frontmatter is ignored (with a warning): only the entry file's frontmatter counts. Code anchors use a different path rule; see [Code references and execution](code.md).

## When a slide is too full, or content is only for some forms

First cut what the slide says, then consider splitting the section. A slide whose content is larger than the canvas is scaled down as a whole, so it does not overflow, but the text gets small; still cut first.

`{hints}` sets the layout of one section per form. Its body is YAML keyed by form id:

```md
:::{hints}
slides: { layout: center, zoom: 0.8, class: my-page }
web: { layout: scrolly }
:::
```

- `slides.layout`: `default`, `cover`, `center` or `full` (no footer or margins). `slides.zoom` scales this slide's content; `slides.class` adds a CSS class.
- `web.layout: scrolly`: on the web page this section scrolls its narration beside fixed on-screen content.

To vary layouts between slides, use these layouts, grids and cards (`{grid}`, `{card}`), diagrams and charts; they are in the [directive reference](directives.md).

`{only}` restricts its body to some forms, for example `:::{only} web, notebook`. Each form receives only its own blocks, and its steps close up: a step taken only by blocks of other forms does not exist in this form, and later steps move up. Step through both forms when you use it. Special cases:

- `:::{only} lecture` holds text that is only spoken in the narrated lecture (needs `@lincyaw/addon-lecture`).
- Narration inside `:::{only} web, slides` is shown on the web page and in the presenter window but not spoken in the lecture.

Content only for the teacher is a matter of audience, not of form; see [Publishing and reproduction](publishing.md).

## Quizzes, exercises and media

For quizzes, exercises, predict-then-reveal, video and other media, first look in the [directive reference](directives.md) for an existing directive. Build a new component (the presmium-develop skill) only when the interaction needs logic that no directive has.
