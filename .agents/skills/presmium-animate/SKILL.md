---
name: presmium-animate
description: "Choose and implement teaching animation in a Presmium lecture.json document: explicit step states, code walkthroughs or project-file scenes using GSAP, Anime.js, Motion, D3, Three.js or Remotion. 讲义需要动画、演示过程、选动画库、找效果、让动画对上步骤和讲解时使用。"
---

# Teaching with animation

Read the teaching document's `lecture.json` and the relevant project code before choosing an effect. Presmium-owned normalized document IR is the only editable authority; animation implementations are referenced project files. Do not add a MyST directive or Markdown source as a second input.

## Choose what to show

- Reveal existing text or list items when order is the lesson. Bind explicit content/item IDs and step states.
- Highlight or replace code when the lesson is a program's changing state. Code highlights and variants reference stable step IDs.
- Use a scene when objects must move, morph or be connected. Its definition declares implementation, parameter Schema and stable state IDs; a component block supplies instance parameters.

Before building anything longer than a single move, read [Story](references/story.md): write the thesis, find the picture that proves it, choose the narrative shape, storyboard the rest frames, script the narration, and review with a cold viewer. [Storyboards](references/storyboards.md) has filled-in examples for popular science, papers, courses, data stories and products. Read [Scenarios](references/scenarios.md) for teaching patterns, [Procedural](references/procedural.md) for motion computed from mathematics (inverse kinematics, ropes, curves, fields, flocks) and how to keep it seekable, [Libraries](references/libraries.md) for implementation choices, [Timeline](references/timeline.md) for step/narration alignment and [Lengths](references/lengths.md) when the piece has a target length (1, 5, 10, 30 or 60 s) or is a promo, teaser, sting or loop to export as video. The gallery has one `lecture.json` per animation library and project files under `scenes/`; `gallery/story` is the worked narrated example. Inspect the closest real example instead of inventing an API.

## Implement through public scene APIs

Keep animation code in `scenes/<name>.ts` or another project file. Use the installed `@lincyaw/addon-motion/scene` public exports and the existing gallery's `defineScene`, `gsapScene`, `animeScene`, `motionScene`, `d3Scene`, `threeScene` or `remotionScene` patterns as applicable. Read the actual public types before choosing an adapter; libraries expose different runtime capabilities.

Register an explicit component definition in `definitions` with a file implementation reference, parameter Schema and declared states. Insert a component block pointing to it; put its state on the corresponding section's steps. Stable state IDs describe implementation states, not the component's position in the document. Existing migrated numeric bindings retain explicit `legacyIndex`; do not rename their numbers into guessed semantic states.

Every state must be reconstructible when selected in any order. Use deterministic values and rebuild from the current step/time; dispose animation timelines, subscriptions, canvas/WebGL resources and timers. An earlier playback side effect is not state.

Use design tokens for component styling. Reuse the project's semantic icons and public host controls. Provide readable static fallback data and report unsupported rendering capabilities.

## Align and verify

Narration is structured in `narrations`; steps name narration IDs. Cue targets use stable block IDs. Timing and voice inheritance belong in `production`, never a second timing object on a step or scene. See `presmium-present/references/lecture.md` for synthesis and playback.

Validate the edited document, then build only the relevant form. Open the actual result, jump forward and backward in arbitrary order, and inspect the static fallback if it matters. Do not claim an animation works merely because JSON validation or compilation succeeded.

```sh
presmium check lesson --json
presmium dev lesson
presmium build lesson --to web
```
