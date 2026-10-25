---
name: presmium-animate
description: "Route a teaching moment in a Presmium document to the right way of showing it in motion: step reveals and cues, code walkthroughs and code evolution, or a scene written in code with GSAP, Anime.js, Motion, D3, Three.js or Remotion, put on the document's steps and narration. Use when a document needs something to appear, move, morph, grow or be pointed at (algorithms, data structures, math, charts, ML, networks, physics, text, title cards), when choosing an animation library, looking for an example effect, or syncing an animation with steps, cues and the synthesized lecture. 讲义需要动画、演示过程、选动画库、找动画示例、让动画对上讲解时使用。"
---

# Showing it in motion

Start from what the learner should see change, not from a library. Many moments need no animation code: blocks that appear one step at a time, a spotlight, a highlight moving through code. Write a scene only when something has to move, morph, grow or be computed between states.

## Words used here

- **Document**: the folder with `lecture.md` (plus `scenes/`, `components/`, media) that you write and build. The `<dir>` in the commands below is that folder.
- **Section**: the part of a document under one `##` heading; one slide when presented.
- **Block**: one piece of on-screen content in a section (a code block, image, formula, directive).
- **Step**: a position inside a section when presenting; pressing next moves one step. A block can appear at a step, or span several steps.
- **Narration**: the plain paragraphs after the blocks. They are the speaker notes, and what the synthesized lecture says. Paragraph k after a multi-step block belongs to its step k.
- **Lecture**: the narrated playback: narration synthesized (or recorded) and played over the presentation, exportable as video.
- **Form**: what a document is built into: `web` (the web page), `slides`, `notebook`, `lecture`. The web page has a *document view* (scrolling, everything shown) and a *present view* (one section at a time, step by step).
- **Directive**: a MyST block ```` ```{name} ```` or `:::{name}`; **role**: an inline ``{name}`text` ``. The **cue** role, ``{cue}`spot` ``, written inside narration, acts at the word that follows it (spotlight, point, ink, move to the next step).
- **Plugin**: an npm package listed in the frontmatter's `plugins` that adds directives and roles.
- **Scene**: an animation written in code, a file `scenes/<name>.ts` in the document, placed with the `{scene}` directive. Its option `:durations:` lists one duration per step (`1.2` or `1.2s` seconds, `800ms`); a scene with n durations spans n steps. In the scene file, `at(k)` is the millisecond at which step k starts on the scene's timeline (`at(0)` is 0).

```md
(merge)=
:::{scene} bpe-merge
:durations: 1.2, 1.2, 1.4
Three words, merged pair by pair.
:::

Step 0's narration.

Step 1's narration.

Step 2's narration.
```

`(merge)=` labels the block so cues can aim at it (``{cue to=merge}`spot` ``); the body is the caption (the accessible description, and what the notebook shows).

## Route

Find the moment, then do what its row says.

**Without a scene.** Write the directive in the section; the plugin named comes with `@lincyaw/presmium` and only needs to be listed in `plugins` (`{slide}` needs nothing). Each directive's syntax is in `presmium-author/references/directives.md`; how to pace them is in section 1 or 2 of `references/scenarios.md`.

| The teaching moment | Use | Plugin |
|---|---|---|
| Points, pieces of a diagram, a result replaced by the next | `{slide}` with `:reveal:` (appears at the next step), `:reveal: items` (list item by item), `:at:`/`:until:` (shown from step a until step b) | none |
| Pointing at something while talking | ``{cue}`spot` ``, `ink`, `point` in the narration | `@lincyaw/addon-lecture` |
| | `{spotlight}`, `{hint}`, `{cursor}` as blocks | `@lincyaw/addon-guide` |
| Guess first, then see | `{predict}`, then a block with `:reveal:` (may be a scene) | `@lincyaw/addon-classroom` with `@lincyaw/addon-session` |
| Reading code part by part | `{code-ref}` with `:steps:` | `@lincyaw/addon-code` |
| Code changing between versions | `{code-ref}` with `:variants:` (lines glide to their new places) | `@lincyaw/addon-code` |
| Executing code line by line | `{step-run}` | `@lincyaw/addon-exec` |
| Formulas and derivations | `$$…$$` in `{slide}` blocks replacing each other with `:at:`/`:until:`, ``{cue}`ink` `` on the changing term (scenes cannot typeset LaTeX) | none; `{cue}`: `@lincyaw/addon-lecture` |
| Footage you already have; static diagrams | `{video}`, `{youtube}`, `{animation}`; ```` ```mermaid ````, `{markmap}` | `@lincyaw/addon-content` (mermaid: none) |

**With a scene.** Do the setup below once. Then open the section of `references/scenarios.md` named in the row: it says what each step should show and which gallery scene to start from. Then follow "Writing a scene".

| The teaching moment | Library (first choice in bold) | `references/scenarios.md` |
|---|---|---|
| An algorithm on a data structure: sort, search, traverse, merge, fill a table | **GSAP**; Anime.js for SVG graphs, D3 for tree and graph layouts | 3. Algorithms |
| Curves, approximations, limits, areas | **D3**, Anime.js or GSAP | 4. Mathematics |
| Linear algebra, vectors, surfaces, 3D geometry, optimisation landscapes | **Three.js** | 4. Mathematics |
| Charts whose data changes, rankings, distributions, hierarchies, flows | **Motion** (simple charts), **D3** (computed layouts) | 5. Data |
| Tokens, attention, embeddings, training, decoding | GSAP, Anime.js, Motion, Three.js or Remotion, by the picture | 6. Machine learning |
| Packets, protocols, pipelines, state machines, signals | **GSAP**, Anime.js or Motion on SVG | 7. Systems |
| Motion in physics, waves, fields, chaos, light | **GSAP** (2D), **Three.js** (3D, many particles) | 8. Physics |
| Words highlighted as they are said, emphasis, quotes, concept cards | **Remotion** or GSAP | 9. Language |
| Title cards, captions, panel transitions | **Remotion** | 10. Structure |

## Setup for scenes

`{scene}` comes from the plugin `@lincyaw/addon-motion`, which `@lincyaw/presmium` does **not** include. In the document folder (or any folder above it, such as a workspace root):

```sh
pnpm add @lincyaw/addon-motion
```

and list it in the frontmatter of `lecture.md`:

```yaml
plugins:
  - '@lincyaw/addon-motion'
```

Presmium looks for a listed plugin in `node_modules` of the document folder and of each folder above it. Without the install, `presmium check` reports `cannot load plugin "@lincyaw/addon-motion": package not found from <dir>` and `{scene}: unknown directive` on every scene. The animation libraries come with the plugin; do not install them.

## The gallery

This skill's folder holds `gallery/`, working example documents: `gallery/<library>/` for `gsap`, `anime`, `motion`, `d3`, `three` and `remotion`, each a `lecture.md` with 13–23 scenes in `scenes/<name>.ts`, one effect per section; and `gallery/timeline/`, one section per timing rule of `references/timeline.md`. The references cite a gallery scene as ``<library> `<name>` ``, meaning `gallery/<library>/scenes/<name>.ts`. The example text in the `lecture.md` files is in Chinese.

- **To read one:** open the scene file, then search its `lecture.md` for `{scene} <name>`: the block shows the `:durations:`, and the paragraphs after it the narration of each step.
- **To reuse one:** copy the scene file into your document's `scenes/`. The D3 scenes also import helpers from `scenes/kit/`; copy that folder with them.
- **To see one running:** copy the whole `gallery/<library>/` folder into the user's project (somewhere with `@lincyaw/addon-motion` installed, see above), and run `presmium dev <copied folder> --to web`. Open the `web` address it prints.

## Writing a scene

1. Write the narration first: one change per step, one paragraph per step.
2. Pick the library by the picture (`references/libraries.md`: the choice table, an index by effect, each library's way of writing a scene and its pitfalls) and copy the nearest gallery scene into `scenes/<name>.ts`.
3. In the scene file, put step k's moves at `at(k)` and end them before `at(k + 1)`.
4. Place `{scene} <name>` with one `:durations:` entry per step, about as long as that step's motion, then the paragraphs. To move to the next step in the middle of a sentence, put ``{cue}`next` `` before the word. A second multi-step block in the same section needs `:reveal:` to start after the first one (`references/timeline.md` explains how steps, paragraphs, cues and the synthesized lecture line up, with measurements).
5. Check: `presmium check <dir>` reports scene and duration errors. `presmium dev <dir> --to web`: in the present view step forward and back; in the document view drag the scene's scrubber; switch between light and dark. When the document has a synthesized lecture (`renderers.lecture` with a voice, see `presmium-present/references/lecture.md`), `presmium build <dir> --to web,lecture` and read its warnings.

## Rules every scene follows

- **The look is a function of the time only.** Presmium pauses the library and seeks it forward, backward, to any frame. No `Math.random` (use a seeded generator), no `requestAnimationFrame`, timers, `Date.now()`, autoplay, D3 transitions, scroll or drag. Callbacks (`onUpdate`, `onComplete`, `.call`) never fire under seeking: drive text and canvas from tweened values.
- **Steps own their time.** Step k's motion lies in `[at(k), at(k + 1)]`; the player shows a step settled at its end, so motion past it is cut off.
- **Set the starting state at build.** An element that appears in a later step is hidden from time 0.
- **Import packages only from `@lincyaw/addon-motion/scene`.** The document does not install the libraries, so `import 'gsap/SplitText'` or `'three/addons/...'` fails to build; GSAP's plugins come as the parameter `plugins`, Three.js addons as `addons`. Relative imports of your own files (`./kit/stage.ts`) and type-only imports (`import type * as D3 from 'd3'`) work.
- **Colors from the design system.** `color('accent')` returns the color as `rgb()`; CSS in the scene can use `var(--pm-color-…)`. Color names: `ink`, `muted`, `line`, `line-strong`, `bg`, `surface`, `sunk`, `accent`, `accent-soft`, `on-accent`, `ok`, `warn`, `danger` (and their `-soft` tints). The scene is built again when the theme changes, and when its size changes if it has no `resize`; check dark mode, where `accent` and `ok` look alike and `surface` is near-black.
- **Size to the picture.** The scene's root element is a CSS size container: lay out in `%`, `cqw`/`cqh` or an SVG `viewBox`; Remotion and Three.js scale themselves.
- **No JSX** in scene files (`React.createElement` for Remotion).

The `{scene}` directive's other options (`:aspect:`, default `16/9`; `:height:`; `:still:`, an image for the notebook and static exports) and its errors are in `presmium-author/references/directives.md`, section "Animation `presmium.motion`".
