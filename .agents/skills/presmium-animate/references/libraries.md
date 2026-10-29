> Document authority: `lecture.json` uses normalized entities; scene implementations below are project code. Bind scenes through `definitions`, component blocks and declared step states.

# Choosing a library and writing the moves

Every library here is driven the same way: the scene file builds a timeline (or a drawing function) once, and Presmium pauses it and seeks it to the time it needs. What differs is what each library draws well. The pitfalls below are the ones met while building this skill's gallery (`gallery/<library>/`, see "The gallery" in `SKILL.md`), each checked by seeking the scene forward and back in a browser, in light and dark.

## What a scene receives

A scene file default-exports one call to a function from `@lincyaw/addon-motion/scene` (`gsapScene`, `animeScene`, `motionScene`, `d3Scene`, `threeScene`, `remotionScene`, `defineScene`). That function is given a builder, which receives one object:

| Field | What it is |
|---|---|
| `root` | The scene's element; put your HTML or SVG in it. It is a CSS size container |
| `at(k)` | The millisecond at which step k starts on the scene's timeline: `at(0)` is 0, `at(k)` is the sum of the first k declared scene durations |
| `durations` | Definition scene durations in milliseconds, one per step |
| `total` | Their sum, the length of the timeline in milliseconds |
| `width`, `height` | The layout size of `root` in CSS pixels before ancestor transforms (including slide scaling) when the scene is built |
| `color(name)` | A design-system color as `rgb()`/`rgba()`, such as `color('accent')` (names in "Rules for every library" below) |
| the library | `gsap` and `plugins`; `anime`; `motion`; `d3`; `THREE`, `renderer` and `addons`; `React` and `remotion` |

Each library counts time in its own unit: GSAP and Motion in seconds (`at(k) / 1000`), Anime.js, D3, Three.js and `defineScene` in milliseconds, Remotion in frames.

## Rules for every library

- **Colors** come from `color(name)` or `var(--pm-color-<name>)`. Names: `bg`, `surface`, `sunk`, `code`, `ink`, `muted`, `line`, `line-strong`, `accent`, `accent-soft`, `accent-line`, `on-accent`, `ok`, `ok-soft`, `warn`, `warn-soft`, `danger`, `danger-soft`, `syntax-key`, `syntax-string`, `syntax-keyword`, `pointer-fill`, `pointer-stroke`, and for light and shade `sheen` (stays light in both themes) and `shadow` (stays dark). Mix with `color-mix(in oklab, var(--pm-color-accent) 40%, transparent)`.
- **Light and shade by theme.** The scene is built again when the theme changes, so decide at build from `color('bg')`. A white highlight (sheen, hot core, sparkle) reads as light on the dark page but as a gap on a white card: on the light page use the accent mixed with `shadow` instead. A halo in the accent color muddies the light page and reads as light only on the dark one: make it about 0.3 strong on light and 0.5 on dark. To darken a color in both themes, mix it with `shadow`, not `ink` (which is light in dark mode).
- **Fonts that ship:** IBM Plex Sans 400/500/600, Source Serif 4 400/600, IBM Plex Mono 400/500, Latin only. Heavier weights are synthesized by the browser; there is no variable axis, so a weight tween snaps. Chinese falls back to system fonts whose widths differ by machine: never measure text at build.
- **SVG ids are page-wide.** A document can show the same scene twice; give every filter, mask, clip path, gradient and pattern an id made when the scene is built (a counter), never a fixed one. Filters and gradients on a zero-height line need `userSpaceOnUse` regions, or nothing renders.
- **Nothing else animates what a scene moves:** no CSS transitions or `@keyframes` on those elements. A filter or clip path tweens only between the same function lists (`blur(0px)` to `blur(8px)`, never from `none`); remove the filter when it reaches zero.
- **Speed effects from speed.** Trails, smears and blur are earlier poses of the same function of time or a function of the velocity of its ease, so they are exact at any seek and vanish at rest.
- **A state owns its end.** A step rests at the end of its state (`ms = at(k + 1)`), so that frame must show this state's result. Clamped interval progress (`at(k)` to `at(k + 1)`) gets this for free; a scene that picks a discrete state or round from the time counts the boundary in the earlier one (`ms > at(k + 1)`), or every step rests on the first frame of the next.
- **Rest frames stay still.** Springs keep creeping after they look settled and re-rasterize text; snap to the exact end within 0.001. Keep an identity 3D transform at rest instead of removing it, and give `preserve-3d` elements `will-change: transform`: Chromium rasterizes a layer that once had a 3D transform differently, so a frame would depend on how it was reached.
- **Seeking a one-state scene:** its reading view shows no step buttons (they appear only with more than one state); check seeking with the scrubber (`.pm-scene__scrub`).

## Pick by the picture

| The picture | Library | Why |
|---|---|---|
| HTML tokens, cells, cards, code text: appear, light up, swap, merge, reorder | **GSAP** | The most robust seeking; any CSS property, `textContent`, stagger in grids; plugins for text splitting, line drawing, morphing, paths, physics. Default when unsure |
| SVG diagrams: edges drawn, boxes filled, a packet on a route, a curve morphing | **Anime.js** or GSAP | Anime.js has drawing, morphing, motion paths and text splitting built in, counts in milliseconds like `at(k)`; GSAP's DrawSVG/MorphSVG handle harder shapes |
| Data that changes value: bars, counters, heatmaps, progress, springs | **Motion** | One sequence with labels and relative times; springs with `bounce`; motion values feeding text and canvas |
| Data graphics built from data: axes, scales, layouts (tree, treemap, force, pack), geo, contours | **D3** | D3 computes the geometry; the scene interpolates it by the time |
| Space: point clouds, surfaces, vectors, 3D curves, camera moves, many particles | **Three.js** | The only 3D option; shaders for tens of thousands of points |
| A typeset panel like a video: title cards, captions, typewriter, kinetic type, transitions between panels | **Remotion** | React components as a function of the frame; `Sequence`/`Series` lay steps out declaratively |
| A canvas drawn by hand, or anything else with a pure `(ms) => void` | `defineScene` | No library |

One scene uses one library. A section that needs a diagram and a 3D view gets two scenes; make the second visible on its own declared step so it starts after the first (`timeline.md`, "Several blocks in one section").

## Find an effect

Each entry ``<library> `<name>` `` is the file `gallery/<library>/scenes/<name>.ts` in this skill's folder; its section in `gallery/<library>/lecture.json` (search its definition parameters for the scene name) shows its declared durations and narration. The D3 scenes import helpers from `gallery/d3/scenes/kit/`: copy that folder along with them.

| Effect | Where |
|---|---|
| Grid or list appearing in a wave (from the centre, by row, by distance) | gsap `stagger-grid`, anime `grid-ripple`, motion `ripple` |
| Text rising per character, word or line | gsap `split-text`, anime `token-split` |
| Typing code or a sentence | gsap `text-plugin`, remotion `typewriter` |
| Word-by-word highlight, kinetic typography, captions | remotion `word-highlight`, `kinetic-type`, `lower-third` |
| Drawing a line, curve or graph edges | gsap `draw-svg`, anime `draw-curve`, `draw-fill`, motion `draw`, remotion `path-draw`, three `lorenz` |
| Highlighting a path in a graph (BFS) | gsap `draw-svg`, anime `graph-bfs` |
| Moving along a path, packets on a link | gsap `motion-path`, anime `packet-path`, motion `flow`, `packet`, three `route` |
| Morphing one shape or curve into another | gsap `morph-svg`, anime `taylor-morph`, motion `morph`, three `surfaces` |
| Counting numbers | gsap `counter`, anime `param-counter`, motion `counter`, remotion `counter` |
| Swapping and sorting | gsap `swap-arc`, `nested`, anime `bubble-swap`, motion `reorder`, remotion `swap` |
| Merging two items into one | gsap `merge` |
| Bars and charts changing value | motion `bars`, remotion `bar-chart`, gsap `css-vars`, d3 `bar-race`, `histogram` |
| Axes that zoom, line and area charts, stacked areas and streamgraphs, pies | d3 `axis-zoom`, `line-draw`, `stack-stream`, `pie-arcs` |
| Data joins: items entering, updating, leaving | d3 `data-join` |
| Trees, treemaps, circle packing, sunbursts, zooming into a node | d3 `tree-morph`, `treemap-tiling`, `pack-zoom`, `sunburst-zoom` |
| Force-directed graphs, shortest path on a graph | d3 `force-path` |
| Voronoi, Delaunay, density contours, quadtrees, chord diagrams, globes | d3 `voronoi-lloyd`, `contour-density`, `quadtree-find`, `chord`, `globe` |
| Heatmaps and color scales | anime `attention-heat`, motion `heatmap`, d3 `heatmap-scales` |
| Emphasis: pulse, shake, bounce, blur focus | gsap `emphasis`, motion `emphasis`, `blur`, `pulse` |
| Card flips and layers in depth | gsap `flip-3d`, anime `flip-cards`, motion `flip` |
| Panels replacing each other: wipe, slide, fade | remotion `series-transition`, `wipe`, motion `wipe` |
| Canvas drawn from tweened values (optimisation paths) | anime `descent-canvas`, motion `canvas` |
| Random-looking but reproducible (k-means, Monte Carlo, scatter) | gsap `seeded`, anime `kmeans-seeded`, remotion `monte-carlo` |
| Comparing easings or springs | anime `easing-lanes`, motion `easings`, `spring-compare`, remotion `easing` |
| Projectiles and gravity | gsap `physics`, remotion `freeze` |
| Point clouds gathering into clusters | three `clusters`, gsap `seeded` |
| Loss surface with gradient descent | three `descent` |
| Vectors, projections, a matrix acting on the plane | three `projection`, `matrix`, motion `matrix` |
| Tens of thousands of particles | three `galaxy` |
| Lighting, materials, shadows, cross-sections | three `materials`, `shadows`, `lathe`, `hull` |
| A camera following a path through a tube | three `route` |
| Keyframe data played with `AnimationClip` and `AnimationMixer` (Towers of Hanoi) | three `hanoi` |
| A progress ring drawn with `pathLength` | motion `ring` |
| Labels and relative times inside one sequence | motion `labels` |
| One CSS variable driving a whole layout | motion `cssvar`, gsap `css-vars` |
| Data mapped to sizes and colors with `gsap.utils` (`mapRange`, `interpolate`, `distribute`, `wrap`) | gsap `utils` |
| One Remotion `Sequence` per step (the basic pattern) | remotion `sequence-steps` |
| Stop-motion (frames held with `posterize`) | remotion `posterize` |

## GSAP

```ts
import { gsapScene } from '@lincyaw/addon-motion/scene'

export default gsapScene(({ root, gsap, plugins, at, color }) => {
  root.innerHTML = `...`
  const s = (k: number) => at(k) / 1000          // GSAP counts seconds
  const tl = gsap.timeline()
  tl.from('.cell', { scale: 0, opacity: 0, duration: 0.4, stagger: { grid: 'auto', from: 'center', amount: 0.8 } }, s(0))
  tl.to('.pair', { backgroundColor: color('accent'), duration: 0.3 }, s(1))
  return tl
})
```

Presmium sets `force3D: false` (so a frame looks the same however it was reached) and registers the plugins. `plugins` holds `SplitText`, `TextPlugin`, `DrawSVGPlugin`, `MorphSVGPlugin`, `MotionPathPlugin`, `CustomEase`, `CustomBounce`, `CustomWiggle`, `Physics2DPlugin`, `PhysicsPropsPlugin` and `Flip`, all registered: tweens can use `drawSVG`, `morphSVG`, `motionPath`, `text`, `physics2D`, and the scene calls `plugins.SplitText.create(...)`, `plugins.CustomWiggle.create(...)`.

- **Later steps:** `from()` and `fromTo()` apply their start values when the timeline is built. For something that appears in step k > 0, set its hidden state with `gsap.set` (e.g. `drawSVG: 0`, `opacity: 0`, `motionPath: { …, end: 0 }`) and tween it with `to()` or `fromTo(…, { immediateRender: false })` at `s(k)`. Without the `set`, a path drawn in step 2 shows fully drawn during steps 0 and 1.
- **Callbacks never fire** (`onUpdate`, `onComplete`, `tl.call`). Numbers: `textContent` with `snap: { textContent: 1 }` or `modifiers: { textContent: v => (+v).toFixed(2) }`. Text swaps: `tl.set(el, { textContent: 'lo' }, time)`, which seeking back undoes.
- **Stagger with `repeat` or `yoyo`:** put them inside `stagger: { …, yoyo: true, repeat: 1 }`; on the tween they repeat the whole wave and run into the next step.
- **TextPlugin:** `preserveSpaces: true` keeps indentation in code.
- **Randomness:** `"random(...)"`, `stagger.from: 'random'` and `utils.shuffle` use `Math.random`; compute values with a seeded generator and pass function-based values.
- **Algorithms:** run the algorithm in plain JS at build (binary search, selection sort, k-means), then emit one tween per event at its step.
- **Moving segments with DrawSVG:** values outside 0–100% wrap unless the end value has `nowrap`; with it, `'-30% 0% nowrap'` → `'100% 130% nowrap'` is a segment that grows out of the start and drains into the end. A head locked to it rides `motionPath` with an ease function, `ease: p => Math.min(1, span * E(p))`.
- **Round caps on zero-length dashes paint dots** (`'0% 0%'`, `'100% 100%'`): hide the path before and after, run the segment a little past the end, or fade sparks while they are still lines.
- **Fast eases on short turns:** `expo.out` or `power4.out` on a 0.5–0.6 s rotation lands within three frames at 30 fps, so the turn is never seen; use `power3.out` over 0.65 s or more.
- **Overshoot is a share of the travel:** wheels or bars that travel different distances need one ease function each (`ease: p => …`) to overshoot by the same amount.
- **A smear's stretch goes on a window-sized wrapper**, not on a long moving strip, or the shown part moves.
- **Not for scenes:** ScrambleText (random on every render), `Flip.from` after `getState` (changes the DOM at build; use `Flip.fit(el, target, { getVars: true })` and tween the returned values), `quickTo`, ScrollTrigger, Draggable, Inertia.

## Anime.js

```ts
import { animeScene } from '@lincyaw/addon-motion/scene'

export default animeScene(({ root, anime, at, color }) => {
  root.innerHTML = `<svg viewBox="0 0 800 450">...</svg>`
  const tl = anime.createTimeline({ autoplay: false, defaults: { ease: 'inOutQuad' } })   // milliseconds
  tl.add(anime.svg.createDrawable('#edge'), { draw: ['0 0', '0 1'], duration: 800 }, at(1))
  tl.add('.cell', { scale: [0, 1], delay: anime.stagger(40, { grid: [8, 8], from: 'center' }), duration: 300 }, at(2))
  return tl
})
```

`anime` is the whole module: `createTimeline`, `stagger`, `svg.createDrawable`, `svg.morphTo`, `svg.createMotionPath`, `text.splitText`, `createSeededRandom`, `cubicBezier`, `steps`, `spring`, `round`, …

- **Only the first tween of a target's property states a from-value** (`[from, to]`); later tweens give only `to`. Order the tweens of one property by time. Presmium seeks from 0 every time, which keeps explicit from-values correct too, but the rule keeps scenes readable.
- **`morphTo` returns `[from, to]`:** use it for the first morph only; later morphs tween `d` to the next path's string (same commands). Keep the target paths inside `<defs>`, or they render as black shapes.
- **`tl.set` with a non-numeric string** (`innerHTML: 'p'`) is not undone when seeking back; swap the opacity of two elements instead. Numbers and colors are undone.
- **Callbacks are muted.** For text and canvas, tween a getter/setter object: `const s = { get v() { return v }, set v(x) { v = x; el.textContent = … } }; tl.add(s, { v: [0, 1234], modifier: anime.round(0) }, at(k))`.
- **SVG transforms:** `translateX`, `scale`, `rotate` are written as CSS `transform`. Put the position on an outer `<g transform>` and animate an inner `<g>` with `transform-box: fill-box; transform-origin: center`.
- **A from-value shows from time 0**, before its tween starts. Elements that join later need an opacity tween that keeps them hidden.
- **`loop` with a stagger `delay`** repeats the whole staggered group as one iteration; add one tween per element instead.
- **Arrowheads:** a `marker-end` shows before its line is drawn; draw arrowheads as separate shapes that fade in.
- **A motion path drawn right to left** turns its label upside down through `rotate`; use only `translateX`/`translateY` from it.
- **A head streak is not a drawable with string keyframes:** `['0 0', '0.92 1', '1 1']` splits its duration evenly and runs ahead of a `'0 0'`→`'0 1'` core; draw values past 1 wrap to the start. Drive the streak from one clock (head `E(p)`, tail `E((p − lag) / (1 − lag))`) and write it with the drawable's `setAttribute('draw', …)`.
- **A spring from rest rushes through a slow phase:** ease the slow part with a keyframe, then finish with `{ to, ease: spring(…) }`; its settling time may run past the state.
- **One property, one ease:** a shock ring whose radius, width and opacity share `outExpo` vanishes in a few frames; give each its own (`{ from, to, ease }`), opacity on `inQuad`.
- **Function values go on each keyframe's `to`:** `[{ from: 0, to: (_, i) => dx[i] }, { to: 0 }]`.
- **A color tween from near the background to a saturated color passes through grey;** grow a clipped shape of the new color instead.
- **Not for scenes:** `text.scrambleText` (not pure even with a seed; write a hash of position and frame instead), `irregular()` (random), `splitText` by lines (re-splits on resize), composition `blend` (nothing while paused), WAAPI, draggables, scroll.
- **3D:** put `perspective` on the parent in CSS; tweening it without a from-value starts at 0px.

## Motion

```ts
import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

export default motionScene(({ root, motion, at, color }) => {
  const S = (k: number) => at(k) / 1000          // Motion counts seconds
  const seq: MotionSequence = [
    [bars, { scaleY: [0, 0.4] }, { at: S(0), delay: motion.stagger(0.08, { from: 'center' }) }],
    [bars, { scaleY: 0.9 }, { at: S(1) }],
    [badge, { scale: [0, 1] }, { at: S(2), type: 'spring', bounce: 0.5, visualDuration: 0.35 }],
  ]
  return motion.animate(seq)
})
```

- **All changes of one value go in one sequence.** Segments for the same element and property merge into one track and seek correctly; a second `motion.animate()` on the same value stops the first.
- **Use absolute `at: S(k)`** for each step's first segment; inside a step, labels (`{ name, at }`) and relative times (`'+0.2'`, `'<'`) are fine.
- **Springs run longer than `visualDuration`** (bounce 0.75 at 0.5 s settles after 2.12 s); size `:durations:` to the settle time.
- **Text and canvas from motion values:** make one `motion.motionValue(0)` per label, use it as a subject in the sequence, write the text in `value.on('change', …)`, and paint once at build (a motion value fires only when it changes). Separate function segments writing the same label fight under seeking.
- **`x`/`y` replace the element's own CSS transform.** If CSS centres it with `translate(-50%, -50%)`, put `x: ['-50%', '-50%']` into the segment.
- **`pathLength` drawing:** use `stroke-linecap: butt`, or round caps leave dots at both ends; pulses along a path with `pathOffset` need `pathSpacing: 1`.
- **Path morph:** `attrD: [d0, d1]` (a plain `d` does nothing), same commands in both.
- **3D flips:** fade a wrapper, not the element with `preserve-3d`, or the back face never shows.
- **Colors** on WAAPI properties (`backgroundColor`) and JS properties (`stroke`, `fill`) mix differently; don't pair them where they must match.
- **Grid stagger:** `stagger()` knows only the index; use `delay: i => distance(i) * k` for a 2D ripple.
- **Segments ease with `easeOut` by default**, not `easeInOut`: set `ease` on every segment. A multi-keyframe segment eases every interval; for a value sampled along a curve, bake the easing into the samples and use `ease: 'linear'`.
- **A spring segment needs both ends** (`scale: [1.12, 1]`); with one target value it is built for a travel of 100.
- **Springs overshoot below zero** on the way back to rest: a floating layer's `z` sinks behind its card. Clamp it and keep a small positive minimum.
- **Not for scenes:** `springValue`, `followValue`, `attachSpring` (wall clock) and `animateView` (View Transitions); `splitText` and layout animation are Motion+ only, so split text and compute layouts by hand.

## D3

```ts
import { d3Scene } from '@lincyaw/addon-motion/scene'

export default d3Scene(({ root, d3, at, color }) => {
  const svg = d3.select(root).append('svg').attr('viewBox', '0 0 640 360')
  // build scales, axes, layouts and elements once here
  const ph = (ms: number, k: number) => Math.min(1, Math.max(0, (ms - at(k)) / (at(k + 1) - at(k))))
  return (ms: number) => {
    const k = d3.easeCubicInOut(ph(ms, 1))
    // set every attribute from k with d3 interpolators
  }
})
```

D3 does not animate here: `transition()` and `d3.timer` run on their own clock and cannot be sought. D3 computes the geometry; the drawing function sets every attribute from the time.

- **Force layouts:** `.stop()` the simulation, tick it a fixed number of times at build and keep the positions of each tick; the drawing function picks or interpolates ticks by the time.
- **`forceLink` replaces `source` and `target` with the node objects;** keep the index pairs separately for drawing the links. Give the simulation a seed (`randomSource(d3.randomLcg(1))`) and centre each stored tick on its mean, or the starting spiral sits in a corner.
- **Interpolate the data, not the drawing.** A pie interpolates start and end angles and redraws with `d3.arc`; a bar race interpolates values and ranks (rank changes within short slices of each period, or bars overlap for long); a zoom interpolates scale domains and redraws the axes every frame. Interpolating path strings with `d3.interpolateString` only works when both paths have the same commands (the horizontal and radial link generators do, so tree → radial tree morphs exactly).
- **Data joins are not timed.** Join once over every item of every state (one key per occurrence), then place each item from the two states around `ms`.
- **Recomputing per frame is fine** for density contours, Voronoi from moved points, quadtrees and `d3.bin` at gallery sizes; precompute iterative work (Lloyd relaxation, force ticks) at build.
- **`d3.interpolateZoom`** gives the fly-to path; use the step's duration, not the one it suggests.
- **Measure nothing at build:** draw lines with `pathLength="1"` and a dash offset.
- **Layout details:** `paddingOuter` before `paddingTop` on a treemap; categorical schemes like `schemeSet3` keep dark labels readable in both themes; a blended projection has no `invert`, so hide the far side of a globe with `d3.geoDistance`.
- **A point riding a clipped curve:** replay the curve into a recording context (`moveTo`, `lineTo`, `bezierCurveTo`) once at build and solve the segment at x; exact, with no `getPointAtLength`, and slicing the data instead makes `curveMonotoneX` wobble. A clip open at the start shows the line's round cap before the draw: keep its width 0 until the draw starts.
- **Numbers that change meaning** (an amount becoming a share): interpolate one number and fade a `%` in; cross-fading two numbers in one place garbles midway.
- **Text halos** (`paint-order: stroke` in `bg`) show as outlines on slides and in the export, where the scene sits on a card; keep labels off busy fills instead.
- **Bending a strip into a ring:** `d3.arc` at tiny curvature jumps (huge radii are imprecise in path strings); sample the outline and bend it with a formula that is exact at zero curvature. `d3-sankey` and `d3-hexbin` are not part of the scene's `d3`.
- **Not for scenes:** `transition()`, `d3.timer`, brush, zoom and drag behaviours. No map data is bundled: a globe uses `d3.geoGraticule` and generated shapes unless the document ships its own data.

## Three.js

```ts
import { threeScene } from '@lincyaw/addon-motion/scene'

export default threeScene(({ THREE, renderer, addons, at, width, height, color, root }) => {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  const ph = (ms: number, k: number) => Math.min(1, Math.max(0, (ms - at(k)) / (at(k + 1) - at(k))))
  return {
    render(ms) { /* set every position, color and uniform from ms */ renderer.render(scene, camera) },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix() },
    dispose() { /* dispose geometries, materials, textures */ },
  }
})
```

`addons` holds `CSS2DRenderer`, `CSS2DObject`, `Line2`, `LineGeometry`, `LineMaterial`, `ParametricGeometry`, `RoundedBoxGeometry` and `ConvexGeometry`.

- **Compute, don't accumulate:** every `render(ms)` assigns positions with `lerp` from eased phases; no `+=` between frames. Random scatter comes from a seeded generator at build.
- **Labels:** a `CSS2DRenderer` on top of the canvas: append `labels.domElement` to `root` with `position: absolute; inset: 0; pointer-events: none`, call `labels.setSize` in `resize` and `labels.render(scene, camera)` after `renderer.render`. Label CSS can use `var(--pm-color-…)`.
- **Lines wider than 1 px:** `Line2` + `LineGeometry` + `LineMaterial` (set `resolution` in `resize`); draw progressively with `geometry.instanceCount`. Plain `Line` draws progressively with `geometry.setDrawRange`.
- **Keyframe data:** `AnimationMixer` breaks when seeking back past the end of a `LoopOnce` clip. Use `LoopRepeat`, a clip as long as the timeline, and `mixer.setTime(Math.min(ms / 1000, clip.duration - 1e-6))`.
- **Shaders:** set `uniforms.uTime.value = ms / 1000` in `render`; multiply `gl_PointSize` by the pixel ratio; set the bounding sphere by hand when positions come from the shader. Normal blending: additive blending washes out on the light page.
- **Theme:** the background stays transparent (don't set `scene.background`); fog color = the page background; lit solids use a mid-tone like `line-strong` (`surface` is near-black in dark mode); a metal with a dark color becomes a black mirror; shadows stay black (`ink` is light in dark mode).
- **Details that bit:** a dashed line built from zero-length points is culled (`frustumCulled = false`); `PCFSoftShadowMap` is gone in r186 (`PCFShadowMap` with `shadow.radius`); TubeGeometry draw ranges must be whole rings (radial segments × 6 indices); `LatheGeometry`'s `phiStart` of 0 is on +z.
- **Glass needs something opaque behind it:** transmission refracts only the scene's own objects (never the page behind the transparent canvas), and with nothing opaque behind it the glass turns milky grey. Put an opaque backdrop mesh behind it and paint shadows into that backdrop's shader (transparent meshes are left out of the transmission pass). On rough glass keep `specularIntensity` near 0.25 and let a smooth clearcoat carry the highlight.
- **Light sweeps:** turn `scene.environmentRotation` across a studio environment (PMREM) of bright panels kept inside its walls (a panel on a wall fights it for depth and vanishes). On a flat face the reflection moves by the rotation minus twice the object's yaw, so hold the yaw still during a sweep.
- **Shader colors:** end a `ShaderMaterial`'s fragment shader with `#include <colorspace_fragment>`, or token colors read through `THREE.Color` come out too dark. `half` is reserved in GLSL ES 3.00 (a variable of that name breaks the shader and the mesh silently disappears).
- **Glow without post-processing:** no bloom or composer is available; use halo sprites with a soft radial texture, a Fresnel rim, and for instanced nodes add the instance color to the emission in `onBeforeCompile` (`totalEmissiveRadiance += vColor.rgb * k`), since the instance color alone only shades the diffuse term. Additive particles converging on one shape saturate to white on the dark page: about 0.3 of each point's light. On the light page a lightening flash vanishes; use sparse stars in a warm token instead.
- **Text over the scene:** besides CSS2D labels, a 2D canvas on top of the WebGL one, drawn in a fixed stage (1280 × 720 scaled to fit) after each render; a 3D anchor lands on it through `vector.clone().project(camera)`. Readouts, charts and formulas then share one coordinate system with the labels.
- **Two views side by side:** `renderer.setScissorTest(true)`, then `setViewport` and `setScissor` per half and one `render` each, with its own scene (an object has one parent, so build the shared parts twice); reset the viewport afterwards. `Line2` reads the current viewport for its resolution by itself.
- **Magnifying a small subject:** scale a group about the subject along the axes it bends in, and keep dots and arrows outside it, placed through `group.localToWorld`, so they keep their shape.
- **Budget:** about 14 Three.js scenes per web page. Each holds a WebGL context, and browsers keep only a limited number per page (older ones lose their canvas); split a longer document.

## Remotion

```ts
import { remotionScene } from '@lincyaw/addon-motion/scene'

export default remotionScene(({ React, remotion, at, durations, color }) => {
  const { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const accent = color('accent')
  function Step({ k }: { k: number }) {
    const f = useCurrentFrame()                     // frames since this step's Sequence began
    const pop = spring({ frame: f, fps: useVideoConfig().fps })
    return h('div', { style: { transform: `scale(${pop})`, color: accent } }, `step ${k}`)
  }
  function Root() {
    return h(AbsoluteFill, { style: { fontFamily: 'var(--pm-font-sans)', fontSize: 48, lineHeight: 1.2 } },
      durations.map((_, k) => h(Sequence, { key: k, from: F(at(k)), layout: 'none' }, h(Step, { k }))))
  }
  return { component: Root, fps, width: 1280, height: 720 }
})
```

- **One `Sequence` per step**, starting at `F(at(k))`: inside it `useCurrentFrame()` counts from the step's start. Leave out `durationInFrames` so a step's result stays on screen; `layout: 'none'` with absolutely placed children keeps the layout from jumping when a step mounts.
- **Clamp every `interpolate`.** The default extrapolation keeps going past the range.
- **Lay out in composition pixels** (1280×720) and set `whiteSpace: 'nowrap'` on labels. The composition is in the page, not an iframe: set font, size, line height and color on the root, and use `div`/`span` rather than `h1`/`p`, whose page styles leak in.
- **Colors** for `interpolateColors` come from `color()` in the closure; plain styles can use `var(--pm-color-…)`.
- **`posterize`** rounds frames from 0: pass `frame - F(at(k))`. A `Series`' last panel has a finite length: skip its exit animation. `transform: scale` doesn't push neighbours: animate margins too for a word that grows.
- **Randomness:** `random(seed)`; a wobble is `Math.sin` with seeded phases.
- **`Easing.exp` never reaches 0 or 1** (2⁻¹⁰ at the ends): `Easing.inOut(Easing.exp)` stops 0.05% short, a soft edge on a full-width pan. Rescale the ease to start at 0 and end at 1.
- **A trail on the impact frame turns a hard stop into mush:** draw trails only before the hit.
- **Trim paths:** draw the visible segment between its tail and head points; a zero-length dash with round caps still draws a dot.
- **Not for scenes:** `Img` and `staticFile` (nothing waits for images to load, and there is no public folder), `Audio`, `Video`; `@remotion/transitions`, `shapes`, `paths`, `noise` are not installed, so write transitions by hand (the gallery's `series-transition`, `wipe`).

## Your own drawing: `defineScene`

```ts
import { defineScene } from '@lincyaw/addon-motion/scene'

export default defineScene(({ root, at, width, height, color }) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  root.append(canvas)
  const g = canvas.getContext('2d')!
  return (ms) => { /* clear and draw everything for ms */ }
})
```

Return `{ seek, resize, dispose }` instead to follow size changes; without `resize` the scene is built again at the new size.
