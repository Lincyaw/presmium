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

## 5. Motion, rhythm and sound

[Lengths](references/lengths.md): what each second shows at 1, 5, 10, 30 and 60 s, the rules every piece follows, the polish list, measured rhythm, carrying beats instead of replacing them, an operated camera, product screens, sound and music, and how to build and export a film.

## 6. Implementation

Keep animation code in `scenes/<name>.ts` or another project file, using the installed `@lincyaw/addon-motion/scene` public exports (`defineScene`, `gsapScene`, `animeScene`, `motionScene`, `d3Scene`, `threeScene`, `remotionScene`); read the actual public types before choosing one. [Libraries](references/libraries.md) picks the library by the picture, lists each one's pitfalls and indexes every gallery piece under "Find an effect"; [Timeline](references/timeline.md) aligns steps and narration; [Procedural](references/procedural.md) covers motion computed from mathematics and where assets come from. The gallery has one `lecture.json` per animation library, `gallery/lengths` (pieces by length and the shared `kit/`), `gallery/films`, `gallery/story` (the worked narrated example) and `gallery/catalog/<deck>` (ready pieces whose text, images and data are parameters). Inspect the closest real example instead of inventing an API.

Register an explicit component definition in `definitions` with a file implementation reference, parameter Schema and declared states. Insert a component block pointing to it; put its state on the corresponding section's steps. Stable state IDs describe implementation states, not the component's position in the document. Existing migrated numeric bindings retain explicit `legacyIndex`; do not rename their numbers into guessed semantic states. Use design tokens for styling, reuse the project's semantic icons and public host controls, dispose timelines, subscriptions, canvas/WebGL resources and timers, provide readable static fallback data and report unsupported rendering capabilities.

## 7. Voice, verify and deliver

Narration is structured in `narrations`; steps name narration IDs. Cue targets use stable block IDs. Timing and voice inheritance belong in `production`, never a second timing object on a step or scene. The voice comes from the workspace's speech engine (Volcengine built in, or an OpenAI-compatible service); see `presmium-present/references/lecture.md` for synthesis, playback and export.

Validate the edited document, then build only the relevant form. Open the actual result, jump forward and backward in arbitrary order, and inspect the static fallback if it matters. Do not claim an animation works merely because JSON validation or compilation succeeded.

```sh
presmium check lesson --json
presmium dev lesson
presmium build lesson --to web
```
