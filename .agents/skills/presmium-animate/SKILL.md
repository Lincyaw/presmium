---
name: presmium-animate
description: "Make animations for Presmium lectures in code: pick GSAP, Anime.js, Motion, Three.js, Remotion or D3 for the picture, write the scene under scenes/, and put it on the lecture's steps and narration so the motion lands on the words. Use when making or fixing an animation in a Presmium lecture, choosing an animation library, looking for an example of an effect (text reveals, line drawing, morphs, charts, graphs, 3D, transitions), or syncing a scene with steps, cues and the synthesized lecture. 用代码给讲义做动画、选动画库、找动画示例、让动画和讲解对齐时使用。"
---

# Animations in code

An animation in Presmium is a **scene**: a file `scenes/<name>.ts` in the lecture's folder that exports one timeline. The lecture places it with `{scene}`, `:durations:` cuts it into steps, and the narration paragraphs after it follow those steps. Presenting plays one step's part per press; a lecture plays it on the narration's time; a video export draws it frame by frame.

The work has two parts, each with a reference:

1. **Pick the library and write the moves**: `references/libraries.md`. What the picture is (DOM tokens, an SVG diagram, a chart, a 3D space, a typeset video panel, a data graphic) decides the library. Each library has a gallery lecture in the Presmium repository, `examples/animations/gallery/<library>/` (https://github.com/Lincyaw/presmium/tree/main/examples/animations/gallery), with 13–23 working scenes, one feature per section; find the effect you want there and start from its scene file.
2. **Put it on the timeline**: `references/timeline.md`. How `:durations:`, `at(k)`, narration paragraphs and `{cue}` line up, what the synthesized lecture does with them, and how to check the result.

## Workflow

1. Write the narration first: what each step says and what the viewer should see change at that moment. One change per step, one paragraph per step.
2. List each step's moves ("the pair lights up", "the two bars swap"), choose one library for the scene with the table in `references/libraries.md`, and open that library's gallery scene closest to the effect.
3. Write `scenes/<name>.ts`: step k's moves start at `at(k)` and end before `at(k + 1)`.
4. Place the block in `lecture.md` with one duration per step, each about as long as that step's motion, then the paragraphs.
5. `presmium check`; then `presmium dev <deck> --to web`: step forward and back in the present view, scrub the scene in the document view, switch light and dark. With a lecture, `presmium build <deck> --to web,lecture` and read the warnings.

## Rules every scene follows

- **The look is a function of the time only.** Presmium pauses the library and seeks it: forward, backward, to any frame. No `Math.random` (use a seeded generator), no `requestAnimationFrame`, timers, `Date.now()`, autoplay, D3 transitions, scroll or drag. Callbacks (`onUpdate`, `onComplete`, `.call`) never fire under seeking: drive text and canvas from tweened values (see each library's notes).
- **Steps own their time.** Step k's motion lies in `[at(k), at(k + 1)]`; the player shows a step settled at its end, so motion past it is cut off.
- **Set the starting state at build.** An element that appears in a later step must be hidden from time 0 (GSAP `gsap.set`, a from-value on the first tween, markup).
- **Import only `@lincyaw/addon-motion/scene`.** A lecture does not depend on the libraries, so `import 'gsap/SplitText'` or `'three/addons/...'` fails to build. Plugins and addons come in the scene's arguments: `plugins` for GSAP, `addons` for Three.js.
- **Colors from the design system.** `color('accent')` returns the token as `rgb()`; CSS can use `var(--pm-color-…)`. Tokens that work for content: `ink`, `muted`, `line`, `line-strong`, `bg`, `surface`, `sunk`, `accent`, `accent-soft`, `on-accent`, `ok`, `warn`, `danger` (and their `-soft` tints). The scene is built again when the theme or (for a scene without `resize`) the size changes, so values read at build stay right; check dark mode anyway, where `accent` and `ok` look alike and `surface` is near-black.
- **Size to the picture.** The scene's root is a size container: lay out in `%`, `cqw`/`cqh`, or an SVG `viewBox`; Remotion and Three.js scale themselves.
- **No JSX** in scene files (write `React.createElement` for Remotion).

The `{scene}` directive's options and errors are in `presmium-author/references/directives.md`, "动画 `presmium.motion`". `examples/animations/bubble-sort/` is a complete lecture where one GSAP scene, code and a counter component move with the narration.
