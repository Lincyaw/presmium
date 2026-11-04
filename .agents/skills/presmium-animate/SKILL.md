---
name: presmium-animate
description: "Choose and implement teaching animation in a Presmium lecture.json document: explicit step states, code walkthroughs or project-file scenes using GSAP, Anime.js, Motion, D3, Three.js or Remotion. 讲义需要动画、演示过程、选动画库、找效果、让动画对上步骤和讲解时使用。"
---

# Teaching with animation

Work top down: each layer decides the next, and its details are in the reference it names. Read the teaching document's `lecture.json` and the relevant project code before choosing anything.

## 1. Ground rules

- Presmium-owned normalized document IR is the only editable authority; animation implementations are referenced project files. Do not add a MyST directive or Markdown source as a second input.
- A step rests on the final frame of its state, and that frame is at once the still on the web page, the slide and the held shot of the video. So a piece is designed as a strip of rest frames, and motion is what carries one into the next.
- Every state is reconstructible when selected in any order: the look is a function of the step and the time only. An earlier playback side effect is not state.

## 2. What to show

- Reveal existing text or list items when order is the lesson. Bind explicit content/item IDs and step states.
- Highlight or replace code when the lesson is a program's changing state. Code highlights and variants reference stable step IDs.
- Use a scene when objects must move, morph or be connected. Its definition declares implementation, parameter Schema and stable state IDs; a component block supplies instance parameters.

## 3. The kind of piece

A teaching segment, an explainer or paper video, a promo, a product demo and a data story differ in how they open, hold, pace, use text, sound and pictures. Name the kind in the brief; it sets those defaults, and the person's brief or a reference overrides them ([Story](references/story.md), Kinds of piece).

## 4. From brief to storyboard

[Story](references/story.md) is the process, each stage ending in a check: brief, thesis, central picture, three storylines for the person to pick, a storyboard of rest frames with what carries each boundary, the script, an animatic the person approves, motion, review against the spec and with cold viewers. [Storyboards](references/storyboards.md) has filled-in examples for popular science, papers, courses, data stories and products; [Scenarios](references/scenarios.md) the usual pictures for each subject.

A piece too large for one agent is made from one storyboard file every agent reads, with a term table that gives each term its definition and first page, shared scene modules that only the coordinator changes, edits through the MCP author actions, a reading of its own words every agent does against the storyboard, review rounds appended to the storyboard and a cold read by a fresh agent in three passes: [Team](references/team.md).

## 5. Motion, rhythm and sound

[Lengths](references/lengths.md): what each second shows at 1, 5, 10, 30 and 60 s, the rules every piece follows, the polish list, measured rhythm, carrying beats instead of replacing them, an operated camera, product screens, sound and music, and how to build and export a film.

## 6. Implementation

Keep animation code in `scenes/<name>.ts` or another project file, using the installed `@lincyaw/addon-motion/scene` public exports (`defineScene`, `gsapScene`, `animeScene`, `motionScene`, `d3Scene`, `threeScene`, `remotionScene`); read the actual public types before choosing one. [Libraries](references/libraries.md) picks the library by the picture, lists each one's pitfalls and indexes every gallery piece under "Find an effect"; [Timeline](references/timeline.md) aligns steps and narration; [Procedural](references/procedural.md) covers motion computed from mathematics and where assets come from. Scene sources live in `gallery/<library>/scenes/` and `gallery/catalog/<deck>/scenes/` (ready pieces whose text, images and data are parameters; `catalog/paper-figure` explains a paper's own figure and ships the crop tool `tools/figure.py`). The gallery's documents show them by scenario: `algorithms`, `data`, `math-ml`, `text`, `emphasis`, `structure`, `product`, `transitions`, `paths-3d` and `craft`, each scene forwarded from its source by a one-line file; `gallery/lengths` (pieces by length and the shared `kit/`), `gallery/films`, `gallery/story` (the worked narrated example) and `gallery/timeline` are documents of their own. Inspect the closest real example instead of inventing an API. The repository’s `examples/gallery/animation-library` links to this same gallery; `pnpm studio` copies it into a workspace with regular files for editing. Keep reusable effect sources here and method guidance in `references/`; complete public courses and product examples belong in `examples/gallery/`.

Register an explicit component definition in `definitions` with a file implementation reference, parameter Schema and declared states. Insert a component block pointing to it; put its state on the corresponding section's steps. Stable state IDs describe implementation states, not the component's position in the document. Existing migrated numeric bindings retain explicit `legacyIndex`; do not rename their numbers into guessed semantic states. Use design tokens for styling, reuse the project's semantic icons and public host controls, dispose timelines, subscriptions, canvas/WebGL resources and timers, provide readable static fallback data and report unsupported rendering capabilities.

## 7. Voice, verify and deliver

Narration is structured in `narrations`; steps name narration IDs. Cue targets use stable block IDs. Timing and voice inheritance belong in `production`, never a second timing object on a step or scene. While the narrated lecture plays, each scene state lasts until its step's voice ends: place beats at fractions of their state (`at(k) + f * durations[k]`) and never rewrite `durations` to the voice ([Timeline](references/timeline.md)). The voice comes from the workspace's speech engine (Volcengine built in, or an OpenAI-compatible service); see `presmium-author/references/lecture.md` for synthesis, playback and export, and `presmium-author/references/writing.md` for how narration is written.

Validate the edited document (`presmium check` or `check_document` also bundles each scene and reports one that doesn't compile, with its file and line), then look at the actual result. With the MCP server, `capture_slides` gives the rest frame of each step of a page and, with `at`, frames that many milliseconds into a step's animation, drawn by the step clock as a lecture export draws them, so they are reproducible; `measure` returns the boxes of elements (a CSS selector) in slide pixels, for positions and overlaps. Capture the steps in any order you like, since each picture is made from its step and time alone; `arrive: 'backward'` checks that going back to a step shows its frame, and `capture_reading` shows the scene on the reading page, also at a phone width (390). Without the MCP server, build only the relevant form, open it, jump forward and backward in arbitrary order, and inspect the static fallback if it matters (exports print it). Do not claim an animation works merely because JSON validation or compilation succeeded, and do not write browser scripts for pictures the tool takes.

```sh
presmium check lesson --json
presmium dev lesson
presmium build lesson --to web
```
