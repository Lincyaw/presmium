# Motion from mathematics

Some motion is better computed than keyframed: a creature whose spine follows its head and whose feet step by themselves, an arm that reaches by inverse kinematics, a rope that whips, a curve built from straight lines, shapes that melt into each other, a flock that splits round a rock. This page lists those techniques, what each is good for telling, and how to keep each one a pure function of the time, which is what a scene must be (seek, step backward, export frame by frame). The interactive explainers that made these techniques famous let the reader drag; the last sections say how to turn dragging into steps, which assets may be reused and what goes wrong.

The rule underneath everything: **closed form when there is one; otherwise simulate at build with a fixed seed and a fixed timestep, store the result, and look it up by time.** The gallery's Fourier fit (`gallery/lengths/scenes/10s/fourier.ts`, maths in `scenes/kit/fourier.ts`) is closed form; the flow-matching explainer (`gallery/story`) is a simulation baked offline into a JSON file.

## Techniques

Costs were measured in Node 22 for a 20-second piece at 30 fps (600 frames) with Float32 storage.

| Technique | The maths in brief | Good for showing | Seekable how | Cost |
|---|---|---|---|---|
| Distance-constraint chain (follow the leader) | p₀ = target; pᵢ = pᵢ₋₁ + L·(pᵢ − pᵢ₋₁)/‖pᵢ − pᵢ₋₁‖; clamp each link's angle to ±a of the last (argonaut's lizard: 14 joints, a = π/8) | inertia and follow-through: the body lags, the tail cuts corners | depends on the head's history: simulate on a scripted head path at build. Closed-form alternative: joint i at arc length s(t) − i·L along the head's path ("on rails", never cuts corners) | spine and four legs: 14 ms, 122 KB |
| Body outline from joint radii | side points pᵢ ± rᵢ·nᵢ joined by one smooth closed curve | a skeleton becoming a creature | closed form per frame from the joints (`kit/fx/paths.ts` `smoothPath`) | one ~32-point path a frame |
| Procedural stepping | a foot stays planted until its rest target is farther than d, then steps on a lifted arc with a little overshoot; diagonal pairs alternate | goal-directed walking from one rule | simulate only the triggers at build, store step events, draw each arc in closed form from its event | negligible |
| FABRIK (Aristidou and Lasenby 2011) | backward pass pins the tip on the target and walks inward; forward pass pins the root and walks outward | reaching; convergence round by round | a fixed iteration count from a fixed start pose is a pure function of the target; warm-starting from the last frame is path-dependent, so precompute | median 2 rounds to 0.5 px (6 bones) |
| CCD | from the last joint to the root, rotate each joint so the tip points at the target | a greedy fix that curls and can get stuck | as FABRIK | median 4 rounds, 90th percentile 44 |
| Two-bone IK | the law of cosines: cos θ₂ = (x² + y² − d₁² − d₂²)/(2d₁d₂); negate θ₂ to flip the knee | a joint is a triangle; two answers per target | closed form in the target | trivial |
| Verlet with constraint passes; position-based dynamics | x' = 2x − x_prev + a·dt²; each stick moves its ends by half the error; repeat | ropes, cloth, soft bodies; velocity as memory | simulate at build with substeps; store per frame | rope of 40: 29 ms, 188 KB; cloth 30 × 20: 425 ms, 2.8 MB |
| Damped spring | x'' + 2ζωx' + ω²x = 0, closed form for ζ < 1, = 1, > 1 | stability; overshoot against sluggishness | closed form (`kit/fx/time.ts` `spring01`, `wobble`); a target that jumps at known times is a sum of step responses | 1000 evaluations: 0.02 ms |
| Second-order dynamics (t3ssel8r) | y + k₁y' + k₂y'' = x + k₃x' with speed f, damping ζ, initial response r (r < 0 anticipates) | a follower's character in three numbers | closed form for a piecewise-constant target; otherwise simulate under the timestep bound | trivial |
| Bézier by de Casteljau | a point on the curve is lerps of lerps of the control points; the triangle's edges are the halves' control polygons | smooth curves from straight lines; why equal t isn't equal distance | closed form; an arc-length table once | a few dozen elements |
| Spline continuity | C0 a shared point, G1 aligned handles, C1 equal first derivatives, C2 equal second; centripetal Catmull-Rom has no cusps | what jumps where two pieces meet (a car's velocity and acceleration arrows) | closed form | trivial |
| Morphing | resample both outlines to N points by arc length, choose the start that minimises the distance, interpolate | identity through change | matching once at build (`kit/fx/sample.ts`) | trivial |
| Signed distance fields and smooth min | union is min(a, b); Quilez's quadratic smin melts shapes with a fillet of thickness k | where a fillet comes from; a body as melted capsules | closed form; sample on a coarse grid and draw the zero contour (`d3.contours`), or a fragment shader | grid 161 × 91: about 2 ms a frame |
| Metaballs and marching squares | f = Σ rᵢ²/‖p − pᵢ‖²; the outline is f = 1, one of 16 cases per cell | merging and splitting as one shape | closed form in the ball positions | 2.3 ms a frame |
| Noise and flow fields | each point's angle from seeded noise; curves step along it; Poisson-disc seeds spread evenly | wind, fur, currents, streamlines | the field is closed form (`kit/fx/noise.ts`); trace streamlines once at build and reveal them with `pathLength` | trivial |
| Boids (Reynolds 1987) | separation, alignment, cohesion within a radius | emergence: a flock with no leader | simulate at build; chaotic (below), so keep runs short | 300 boids: 110 ms, 2.1 MB |
| L-systems | a string rewritten in parallel, drawn by a turtle | complexity from a tiny rule; growth | closed form: generation n is fixed; grow by revealing segments by depth | 32,768 segments: 4 ms |
| Reaction–diffusion (Gray–Scott) | two coupled diffusion equations; two numbers choose spots, stripes or mazes | Turing patterns | simulate at build; store checkpoints and re-simulate forward on a seek | 320 × 180: 2.1 s, 11 MB |
| Cellular automata | the next cell from its neighbourhood by a rule table (Rule 30, Rule 110, Life) | randomness from local rules; time drawn as space | exact integer state: compute every generation at build and reveal row by row | trivial |

Draw tens to a few hundred moving elements in SVG (join many items into one path string: all boids, all segments of one depth), thousands in a canvas, per-pixel fields in a Three.js shader.

## What interactive explainers do

- **One new variable per figure**, each reusing the last picture (Bartosz Ciechanowski, <https://ciechanow.ski/gears/>); constructions shown, not stated.
- **Change the inputs, show the outputs**; split an algorithm into stages, one diagram each (Red Blob Games, <https://www.redblobgames.com/making-of/line-drawing/>).
- **Climb the ladder of abstraction**: a time slider, then the slider absorbed into the picture (the whole trajectory), then many trajectories over a parameter, then a colour map over two (Bret Victor, <https://worrydream.com/LadderOfAbstraction/>).
- **Pair animation with a static summary**: animation demands memory, "the eye scans faster than the hand" (Mike Bostock, <https://bost.ocks.org/mike/algorithms/>).
- **Make the reader love the question first**, then But and Therefore, then a sandbox (Nicky Case, <https://blog.ncase.me/how-i-make-an-explorable-explanation/>). Only a fraction of readers interact at all (Hohman et al., Distill 2020, <https://distill.pub/2020/communicating-with-interactive-articles/>).
- **Run physics on fixed steps**, decoupled from drawing (Steven Wittens, <https://acko.net/blog/animate-your-way-to-glory/>).

## Turning interaction into steps

What survives being stepped or played as video: the construction, one new variable per state, comparisons, and predict-then-reveal (a step's rest is the pause in which the viewer predicts). What is lost: the reader's own questions and the feel of cause through one's hand. Compensate by climbing the ladder: show the abstraction (a trail is time absorbed; an overlay is a parameter absorbed), then step back down to one concrete case.

1. **A drag becomes a scripted target path.** Key the "hand" at state boundaries, ease between them, and draw a pointer (`pointer-fill`, `pointer-stroke`) that arrives, presses (70–120 ms), drags and releases, so the cause is seen before the effect. The simulation reads only this path.
2. **A slider becomes one value per state.** A closed-form scene tweens the parameter and re-solves every frame. A simulation gets one precomputed run per value from the same start, and the states cut or morph between runs: changing a parameter mid-run is a different experiment.
3. **Draw the control**: a slider or dial whose thumb moves, with the value as a readout beside it.
4. **Exploration becomes enumeration**: the 3–5 values a curious reader would try (ζ = 0.2, 1, 2; a target out of reach; CCD's collinear start), one state each, and a last state that overlays them all.
5. **The reading view's scrubber is a slider** when scene time maps onto a meaningful parameter (de Casteljau's t, FABRIK's round, the Fourier fit's circle count).
6. **The sandbox stays outside the scene**: an interactive block after it on the web page, never in the slides or the video.
7. **Play with the input to reveal a mapping**: colour the input by position, rotate it, drop a stone into it, and let the output inherit the change (the flow-matching video does all three).

## Scene ideas

Each is a plan, with its thesis and states; build it by `story.md`.

| Scene | Thesis (看完后，观众明白……因为他们看到……) | States |
|---|---|---|
| Three rules make a lizard (D3, 19 s) | a lifelike creature is three local rules (keep the distance, limit the bend, step when too far), because each rule was added to the same chase and fixed one visible flaw | chain 3 s · fold 2.5 s (the chain folds onto itself) · limit 3 s (the same turn sweeps wide past the folded ghost) · body 2.5 s · legs 5 s (a foot's threshold ring lights, the foot arcs) · hold 3 s |
| FABRIK reaches in two sweeps (D3, 18 s) | FABRIK pins the tip, then the root, and settles in a couple of rounds where CCD curls, because one sweep at a time and both misses appear on one chart | arm · inward (the root comes loose, the gap in warn) · outward (miss about 3 px) · rounds 2–4 (under 0.5 px) · a CCD ghost on the same target (one round misses about 80 px) · tracking a dragged target, out of reach too |
| A knee is a triangle (D3, 6 s) | a two-bone limb is solved by the law of cosines and has two answers, because the triangle followed the foot, the knee flipped, and the leg straightened at the edge of its reach | reach · flip · limit |
| Velocity is memory (Verlet rope, 18 s) | Verlet keeps velocity as the gap to the last position, and small steps stiffen a rope more than repeated corrections, because the ghosts of the last frame, a stretching rope and two ropes of equal cost appeared | particles with ghosts · sticks, one pass · 1, 10, 40 passes · 1 × 40 against 4 × 10 (8.6% against 2.2% stretch) · a whip · rest |
| Three followers, one target (16 s) | f, ζ and r give motion a character, and ζ alone decides overshoot, because three followers answered the same jumps, each tracing its position over time | glide (ζ = 1) · wobble (ζ = 0.3) · anticipate (r = −1.5) · a fan of traces as ζ sweeps · hold |
| A curve from straight lines (de Casteljau, 17 s) | a cubic Bézier is lerps of lerps, the same construction splits it, and equal t is not equal distance, because three levels of moving points traced the curve, its halves fell out, and ticks bunched at the bends | hull · one lerp · all levels at t = 0.4 · trace · split · drag a control point · equal t against equal length |
| What jumps at the seam (spline continuity, 15 s) | C0, G1, C1 and C2 are "what jumps where two pieces meet", because a car's velocity and acceleration arrows jumped at the seam and stopped jumping as the join was upgraded | c0 · g1 · c1 · c2 · hold, with a curvature comb |
| A flock from three rules (boids, 20 s) | a flock needs no leader, only separation, alignment and cohesion within a small radius, because each rule was switched on for the same seeded crowd | crowd · separate · align · cohere · an obstacle splits and rejoins the flock · hold; each state its own run from the last one's stored end |
| Clay from distances (SDF smooth union, 17 s) | a union of shapes is the minimum of their distances and a smooth minimum adds a fillet, because the distance rings, their crease and the fillet growing with k appeared, then a body melted from capsules | field · min (a sharp crease) · smooth (k grows) · pull apart (a neck stretches and snaps) · creature · hold |
| A plant from a rewrite rule (L-system, 16 s) | a branching plant comes from rewriting one symbol in parallel, because the string grew beside the drawing and each segment split into its children in place | rule · turtle with its stack · generations 2–4 (5, 25, 125, 625 segments) · generation 5 grows with a sway · hold |

The Fourier fit, the de Casteljau scene and the universal-approximation storyboard (`storyboards.md`) share one picture, "add parts, watch the error fall"; give them the same vector-editor look so they read as a series.

## Assets and sources

- **Animation runtimes**: Rive's web runtime is MIT, and a linear animation's time is settable (a state machine can only advance, so it would be replayed from 0); Lottie (lottie-web, MIT) seeks with `goToAndStop`; LottieFiles' free animations use the Lottie Simple License; DragonBonesJS is MIT; Spine's runtimes need an editor licence. None of them is a Presmium scene library today; adding one is a dependency decision.
- **Code to learn from**: argonaut's procedural animals (MIT, <https://github.com/argonautcode/animal-proc-anim>), flubber (MIT), simplex-noise (MIT), Red Blob Games (MIT or Apache), Nicky Case (CC0), Manim (MIT). Shadertoy shaders, OpenProcessing sketches, p5.js examples and Inigo Quilez's articles (re-derive their maths into the scene's own time function).
- **Icons** (stroke icons draw on with `pathLength`, recoloured by tokens): Lucide (ISC), Tabler (MIT), Phosphor (MIT; a weight change is a cut, not a tween), Simple Icons (CC0 data; the trademarks remain their owners').
- **Characters and illustrations**: Open Peeps (CC0; separate parts that can ride a bone chain), Humaaans (CC0), Kenney (CC0), OpenMoji (CC BY-SA 4.0). unDraw.
- **Strokes and writing**: Make Me a Hanzi (9,000+ characters with stroke outlines and medians for stroke-order animation; Arphic Public License graphics, LGPL data; <https://github.com/skishore/makemeahanzi>), KanjiVG (CC BY-SA 3.0), Quick, Draw! (CC BY 4.0; strokes keep their timing, so a drawing replays at its author's speed), Hershey single-stroke fonts.
- **Logos**: theSVG first, then the organisation's GitHub avatar, then the site's favicon; never redraw a logo. Use a brand's mark only for that exact brand.
- **Sound and music**: see `lengths.md`, "Sound and music".
- **Images in a scene** are imported, `import figure from '../figures/x.png'` (or `x.png?url`), not built with `new URL(…, import.meta.url)`: an imported PNG or JPEG of 48 KB or more is published as WebP, no wider than 2400 px.
- **Where each asset came from** goes in the reading view's notes: the source and what was changed, so the next author can replace it.
- **Motion data**: the CMU Graphics Lab motion capture database ("free for all uses", not for resale), for a stick figure or to check an IK gait.
- **Already in the kit**: seeded `mulberry32` and `hash`, `noise1`/`noise2`, `spring01`, `wobble`, `shake`, `smoothPath`, `samplePath`, `trail`, and the Fourier series with `bezierPath`.

## Pitfalls

- **Engines round transcendental functions differently.** ECMAScript makes `Math.sin`, `cos`, `exp`, `atan2` and `hypot` implementation-approximated, while `Math.sqrt` and the four operations are exact: in simulation loops use `Math.sqrt(dx*dx + dy*dy)`, and tabulate the sines of the scripted input once.
- **Chaos turns those last bits into a different picture.** After a 10⁻¹² change in one start coordinate, a Verlet rope stayed within 10⁻¹¹ px for 20 s, but 300 boids differed by 700 px after 15 s. Keep chaotic runs short and start each state from the stored end of the previous one, or bake the run into a JSON file shipped with the scene, which is identical everywhere. GPU simulations are not bit-identical across devices and can't run backwards: anything that must match between the web page, the slides and the export runs on the CPU.
- **Stability**: explicit Euler gains energy; position-based stiffness depends on the iteration count and the timestep; prefer substeps to extra passes (8.6% against 2.2% stretch at equal cost). Fix the simulation step independently of the display rate, and port demo code's per-frame `lerp(0.4)` to timestep-exact forms (1 − e^(−k·dt)).
- **Fixed iteration counts**, never a tolerance loop, so each frame's cost and result are fixed; CCD sticks when the chain starts collinear with the target.
- **Angles**: wrap them, and interpolate stored angles the short way round.
- **Jitter at rest**: a hanging rope with one step of ten passes still moves 0.3 px a frame after 30 s. A state owns its end: blend the simulation into its final pose over the state's last ~300 ms, or hold the last frames, and round stored positions (to 0.01 px) so sub-pixel noise never re-rasterizes strokes.
- **The time grid**: store at a fixed rate, look up by `ms × rate / 1000` and interpolate neighbours; put each state boundary on a stored sample, so the rest frame is a stored frame; store discrete events (a footstep, a split) as times and draw them in closed form.
- **Where the cost is paid**: a scene is built in the browser on load, again on a theme change, and on a resize when it has no resize handler. Memoize the simulation at module scope by its parameters, simulate in stage units (the 1280 × 720 box), never CSS pixels, and bake anything that takes more than about a second.
- **Storage**: frames × points × 2 × 4 bytes. Fields keep checkpoints (say, one a second) and re-simulate forward on a seek; fine for steps and export, sluggish for scrubbing.
- **Physical overshoot is the content**: `lengths.md` says data values never overshoot; a spring or a rope overshooting is the thing shown, so label it.
