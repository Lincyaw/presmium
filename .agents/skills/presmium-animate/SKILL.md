---
name: presmium-animate
description: "Route a teaching moment in a Presmium lecture to the right way of showing it in motion: step reveals and cues, code walkthroughs and code evolution, or a scene written in code with GSAP, Anime.js, Motion, D3, Three.js or Remotion, put on the lecture's steps and narration. Use when a lecture needs something to appear, move, morph, grow or be pointed at (algorithms, data structures, math, charts, ML, networks, physics, text, title cards), when choosing an animation library, looking for an example effect, or syncing an animation with steps, cues and the synthesized lecture. 讲义需要动画、演示过程、选动画库、找动画示例、让动画对上讲解时使用。"
---

# Showing it in motion

Start from what the learner should see change, not from a library. Many moments need no animation code: blocks appearing per step, a spotlight, a code highlight moving. Write a **scene** (a timeline in `scenes/<name>.ts`, placed with `{scene}`) when something has to move, morph, grow or be computed between states.

## Route

| The teaching moment | Use | Detail |
|---|---|---|
| Points, pieces of a diagram, a result replaced by the next | `{slide}` with `:reveal:`, `:reveal: items`, `:at:`/`:until:` | `scenarios.md` §1 |
| Pointing at something while talking | ``{cue}`spot` ``/`ink`/`point`, `{spotlight}`, `{hint}`, `{cursor}` | §1 |
| Guess first, then see | `{predict}` + a revealed block (may be a scene) | §1 |
| Reading code part by part | `{code-ref}` `:steps:` | §2 |
| Code changing between versions | `{code-ref}` `:variants:` (lines glide to their new places) | §2 |
| Executing code line by line | `{step-run}` | §2 |
| An algorithm on a data structure: sort, search, traverse, merge, fill a table | Scene, **GSAP** (Anime.js for SVG graphs, D3 for tree and graph layouts) | §3 |
| Curves, approximations, limits, areas | Scene, **D3**, Anime.js or GSAP | §4 |
| Linear algebra, vectors, surfaces, 3D geometry, optimisation landscapes | Scene, **Three.js** | §4 |
| Formulas and derivations | KaTeX in `{slide}` blocks replacing each other per step, ``{cue}`ink` `` on the changing term (no LaTeX inside scenes yet) | §4 |
| Charts whose data changes, rankings, distributions, hierarchies, flows | Scene, **Motion** (simple charts) or **D3** (computed layouts) | §5 |
| Tokens, attention, embeddings, training, decoding | Scene; library per picture | §6 |
| Packets, protocols, pipelines, state machines, signals | Scene, **GSAP**/**Anime.js**/**Motion** on SVG | §7 |
| Motion in physics, waves, fields, chaos, light | Scene, GSAP (2D), **Three.js** (3D, many particles) | §8 |
| Words highlighted as they are said, emphasis, quotes, concept cards | Scene, **Remotion** or GSAP | §9 |
| Title cards, captions, panel transitions | Scene, **Remotion** | §10 |
| Footage you already have; static diagrams | `{video}`, `{youtube}`, `{animation}`; `mermaid`, `{markmap}` | §10 |

`references/scenarios.md` has, per scenario, what each step shows, how to build it and the gallery scene to start from. The gallery is `examples/animations/gallery/<library>/` in the Presmium repository (https://github.com/Lincyaw/presmium/tree/main/examples/animations/gallery): 111 working scenes, one effect per section.

## Writing a scene

1. Write the narration first: one change per step, one paragraph per step.
2. Pick the library by the picture (`references/libraries.md`: the choice table, an index by effect, each library's way of writing a scene and its pitfalls) and copy the nearest gallery scene.
3. In `scenes/<name>.ts`, step k's moves start at `at(k)` and end before `at(k + 1)`.
4. Place `{scene}` with one `:durations:` entry per step, about as long as that step's motion, then the paragraphs. Use ``{cue}`next` `` to move at a word and `:reveal:` on a second scene in the section (`references/timeline.md`: how steps, paragraphs, cues and the synthesized lecture line up, measured).
5. `presmium check`; `presmium dev <deck> --to web`: step forward and back in the present view, scrub in the document view, switch light and dark. With a lecture, `presmium build <deck> --to web,lecture` and read the warnings.

## Rules every scene follows

- **The look is a function of the time only.** Presmium pauses the library and seeks it forward, backward, to any frame. No `Math.random` (use a seeded generator), no `requestAnimationFrame`, timers, `Date.now()`, autoplay, D3 transitions, scroll or drag. Callbacks (`onUpdate`, `onComplete`, `.call`) never fire under seeking: drive text and canvas from tweened values.
- **Steps own their time.** Step k's motion lies in `[at(k), at(k + 1)]`; the player shows a step settled at its end, so motion past it is cut off.
- **Set the starting state at build.** An element that appears in a later step is hidden from time 0.
- **Import only `@lincyaw/addon-motion/scene`.** A lecture does not depend on the libraries, so `import 'gsap/SplitText'` or `'three/addons/...'` fails to build. GSAP's plugins come as `plugins`, Three.js addons as `addons`.
- **Colors from the design system.** `color('accent')` returns the token as `rgb()`; CSS can use `var(--pm-color-…)`. Content tokens: `ink`, `muted`, `line`, `line-strong`, `bg`, `surface`, `sunk`, `accent`, `accent-soft`, `on-accent`, `ok`, `warn`, `danger` (and their `-soft` tints). The scene is built again when the theme changes, and when its size changes if it has no `resize`; check dark mode, where `accent` and `ok` look alike and `surface` is near-black.
- **Size to the picture.** The scene's root is a size container: lay out in `%`, `cqw`/`cqh` or an SVG `viewBox`; Remotion and Three.js scale themselves.
- **No JSX** in scene files (`React.createElement` for Remotion).

The `{scene}` directive's options and errors: `presmium-author/references/directives.md`, "动画 `presmium.motion`". A full lecture where a scene, code and a component move with the narration: `examples/animations/bubble-sort/`.
