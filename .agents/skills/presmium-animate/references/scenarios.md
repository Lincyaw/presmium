# Teaching scenarios and how to animate them

Each entry: what the viewer should see change, step by step, and how to build it. "Gallery" names a scene in `examples/animations/gallery/<library>/scenes/` (on GitHub: https://github.com/Lincyaw/presmium/tree/main/examples/animations/gallery). Directives without a library (`{slide}`, `{code-ref}`, `{spotlight}` …) are in `presmium-author/references/directives.md`.

## 1. Pacing and attention (usually no scene)

| Scenario | Do | Notes |
|---|---|---|
| Points appear one by one | `{slide}` with `:reveal: items` | One step per item; narration paragraph per item |
| A diagram built up piece by piece | Several blocks with `:reveal:`, or one `{slide}` per state with `:at:`/`:until:` | Static pieces don't need a scene; use a scene only when pieces *move* |
| Replace a result with the next one (before → after, wrong → right) | Two `{slide}` blocks: `:at: 0` `:until: 1`, then `:at: 1` | Reversible, no code |
| Look here | ``{cue to=<block>}`spot` ``, `point`, `ink` in the narration; `{spotlight}`, `{hint}` as blocks | `ink` circles with a marker; `spot` dims the rest |
| Show where to click in a UI or a component | `{cursor}` (`move`, `hover`, `click` per step) and ``{cue}`click <action>` `` | `examples/animations/bubble-sort` clicks a counter |
| Learner guesses first, then sees | `{predict}` followed by a `:reveal:` block (the reveal can be a scene) | The scene's first step is the answer |
| Draw on the slide live | The stage's pen (`d`) | Saved with the lecture when served |

Write a scene when something must **move, morph, grow or be computed** between states. Otherwise blocks and cues are lighter and work in every form.

## 2. Code

| Scenario | Do | Notes |
|---|---|---|
| Walk through a function part by part | `{code-ref}` with `:steps:` over `#region`s | Highlight moves per step, narration per part |
| Code evolving: refactor, fix, add a feature | `{code-ref}` with `:variants:` (commits) | Lines move to their new places (Shiki Magic Move); honours reduced motion |
| Line-by-line execution with variables | `{step-run}` (Python) | The learner can step it themselves in the document view |
| Show it runs | `{code}` with `:run:`; `{run-panel}` for an editable playground | Output recorded at build |
| The data structure behind the code changing (array, pointers, stack, tree) | Code block + a **GSAP** scene in the same section; narration cues ``{cue to=code lines=3-4}`spot` `` at the moment the scene moves | Gallery: gsap `keyframes` (binary search), `nested` (selection sort); `bubble-sort` lecture |
| Typing code as if live | GSAP `text-plugin` (`preserveSpaces: true`), Remotion `typewriter` | Prefer real code blocks when learners must copy it |

## 3. Algorithms and data structures (GSAP first)

Run the algorithm in plain JS while building the scene, record its events (compare, swap, visit, push), and emit one tween per event at its step. The scene then replays a precomputed trace, which keeps it a function of the time.

| Scenario | Each step shows | Build | Gallery |
|---|---|---|---|
| Sorting | Compare (highlight pair) → swap (move, arc) → settled (color) | GSAP keyframes for arcs; Motion `x` tracks | gsap `swap-arc`, `nested`; anime `bubble-swap`; motion `reorder`; remotion `swap` |
| Searching | Pointers move, range narrows | GSAP keyframes, Motion `steps()` for discrete hops | gsap `keyframes`; motion `scan` |
| Graph traversal, shortest path | Visit node (fill), traverse edge (draw), frontier per level | GSAP DrawSVG or Anime `createDrawable` on overlay edges | gsap `draw-svg`; anime `graph-bfs`; d3 `force-path` |
| Trees: insert, grow, recursion trees | Node pops in, edge draws to parent, level by level | Motion springs; D3 `hierarchy` + tree layout for positions | motion `spring-tree`; d3 `tree-morph` |
| Merge / split / combine items (BPE, union-find, Huffman) | Two items highlight → collapse into one → new item appears elsewhere | GSAP collapse + `set` text | gsap `merge`; `libraries/bpe-merge` |
| Grids and tables: DP, convolution, flood fill | Cells fill in order, a wave from a cell | Stagger with `grid`/`from`, or delays by distance | gsap `stagger-grid`; anime `grid-ripple`; motion `ripple` |
| Search with candidates (beam search, top-k) | Candidates scored, losers leave, winners move to slots | GSAP `Flip.fit` vars; Remotion reverse spring | gsap `flip-fit`; remotion `beam-prune` |
| Clustering, iterative refinement | Points recolor, centroids move, repeat | Seeded data; one round per step | gsap `seeded`; anime `kmeans-seeded`; d3 `voronoi-lloyd` |
| Spatial structures (quadtree, Voronoi, nearest neighbour) | Structure rebuilt as points arrive; a probe queries | D3 recomputed per frame | d3 `quadtree-find`, `voronoi-lloyd` |

## 4. Mathematics

| Scenario | Build | Gallery |
|---|---|---|
| Function graph drawn, a point riding the curve, its tangent | D3 scales + `pathLength` dash, or SVG + Anime/GSAP drawing | d3 `line-draw`, `axis-zoom`; anime `draw-curve`; remotion `path-draw` |
| Approximation converging (Taylor, Fourier partial sums) | Morph one curve into the next | anime `taylor-morph`; gsap `morph-svg`; motion `morph` |
| Zooming into a limit or a detail | Interpolate the scale domain, redraw axes | d3 `axis-zoom`, `pack-zoom` |
| Area under a curve, accumulation | D3 `area` filling; a CSS variable or tweened value drives the bound | d3 `line-draw` (area) |
| Linear maps, bases, determinants | Interpolate matrix entries, move a grid and î, ĵ | three `matrix`; motion `matrix` |
| Vectors, projections, dot products | ArrowHelper, dashed projection, live readout | three `projection` |
| Surfaces, gradients, optimisation | Displaced plane, precomputed descent path | three `descent`, `surfaces`; anime `descent-canvas`; motion `canvas` |
| Solids of revolution, cross-sections, convex hulls | Lathe sweep, clipping plane, hull edges | three `lathe`, `hull` |
| Probability by simulation (Monte Carlo, sampling, histograms) | Seeded samples arrive, estimate updates | remotion `monte-carlo`; d3 `histogram`, `contour-density` |
| Easing and rates of change compared | Same motion with different curves side by side | anime `easing-lanes`; motion `easings`; remotion `easing` |
| **Formulas and derivations** | **Typeset in the page**, not in a scene: `$$…$$` in `{slide}` blocks that replace each other with `:at:`/`:until:`, one line of the derivation per step, with ``{cue}`ink` `` on the changing term. A scene cannot typeset LaTeX yet; plain-text formulas (`σ(x) = 1 / (1 + e⁻ˣ)`) work as labels. Morphing one formula into the next (Manim's `TransformMatchingTex`) and handwriting a formula are not available | gsap `morph-svg` labels show the plain-text style |

## 5. Data and statistics

| Scenario | Build | Gallery |
|---|---|---|
| A chart whose data changes (before/after, over time) | Motion bars (one track per bar), or D3 interpolating values | motion `bars`; remotion `bar-chart`; d3 `bar-race` |
| Ranking over time | Interpolate values and ranks in short slices | d3 `bar-race` |
| Composition, shares, parts of a whole | Pie angles interpolated; stacked areas → streamgraph | d3 `pie-arcs`, `stack-stream`; gsap `css-vars` |
| Distributions, binning, density | `d3.bin` re-binned per frame; KDE curve | d3 `histogram`, `contour-density` |
| Matrices and correlations | Cells colored by a scale; scale switched | d3 `heatmap-scales`; anime `attention-heat`; motion `heatmap` |
| Hierarchies and proportions | Treemap, pack, sunburst; zoom into a node | d3 `treemap-tiling`, `pack-zoom`, `sunburst-zoom` |
| Flows between groups | Chord ribbons opening | d3 `chord` |
| Data entering and leaving (joins, filters) | Join once over every state, place by time | d3 `data-join` |
| Big counts and growth | Counter with easing, log-scale bar | gsap `counter`; anime `param-counter`; motion `counter`; remotion `counter` |

## 6. Machine learning and AI

| Scenario | Gallery |
|---|---|
| Tokenization (BPE merges, splitting text into tokens) | `libraries/bpe-merge`; gsap `merge`; anime `token-split` |
| Attention weights and masks | anime `attention-heat`; motion `heatmap`; `libraries/attention` |
| Embeddings and clusters in space | three `clusters`; `libraries/embedding` |
| Forward pass through layers | anime `nn-sync`; motion `flow` (pulses forward, then backward) |
| Training curves, overfitting | motion `draw`, `morph` |
| Gradient descent, momentum, loss surfaces | three `descent`; anime `descent-canvas`; motion `canvas` |
| Softmax and temperature | gsap `css-vars`; remotion `bar-chart` |
| Decoding: beam search, sampling | remotion `beam-prune`; gsap `flip-fit` |
| Activation functions | gsap `morph-svg` |

## 7. Systems, networks and architecture

| Scenario | Build | Gallery |
|---|---|---|
| Request/response, packets on a link, protocol handshakes | Motion path or `times` keyframes per leg; one step per message | gsap `motion-path`; anime `packet-path`; motion `packet`; remotion `loop-pulse` |
| Pipelines and architecture diagrams assembling | Boxes drawn then filled, links drawn, outputs fan out | anime `draw-fill`; `libraries/pipeline` |
| Signal or data flowing through a network | Dash pulses along edges (`pathOffset`) | motion `flow` |
| State machines and protocols | SVG states; active state recolored, transition edge drawn; MorphSVG when a state changes kind | gsap `draw-svg`, `morph-svg`; static version: `mermaid` |
| Bits, counters, registers | Discrete `set` changes per tick | anime `binary-set`; motion `scan` |
| Hashes and avalanche effects | Pure scramble from a hash of position and frame | anime `hash-scramble` |
| Routes on a map, distances on a sphere | Orthographic globe, great-circle route | d3 `globe` (no bundled map data) |

## 8. Physics and natural sciences

| Scenario | Gallery |
|---|---|
| Projectiles, gravity, freezing a moment to add vectors | gsap `physics`; remotion `freeze` |
| Oscillations and waves | anime `wave-loop`; remotion `wobble` |
| Bouncing, squash and stretch, collisions (kinematics feel) | anime `ball-keyframes`; gsap `emphasis` |
| Chaotic and dynamical systems, trajectories in 3D | three `lorenz` |
| Particle systems, galaxies, fields | three `galaxy` |
| Light, shadow, materials, the time of day | three `shadows`, `materials` |
| Molecules or lattices | three `clusters` (instancing); remotion `wobble` (lattice vibration) |

## 9. Language, text and argument

| Scenario | Gallery |
|---|---|
| Read along: words highlighted as they are said | remotion `word-highlight` (time each word to the narration's step) |
| Emphasis on a key term or claim | remotion `kinetic-type`; gsap `split-text`; motion `emphasis` |
| A quote or definition appearing | gsap `split-text`; anime `token-split` |
| Comparing two versions of a text | motion `wipe`; remotion `wipe`; or two `{slide}` with `:at:`/`:until:` |
| Concept cards: term on the front, meaning on the back | gsap `flip-3d`; anime `flip-cards`; motion `flip` |

## 10. Structure of a lecture and video-like moments

| Scenario | Do | Gallery |
|---|---|---|
| Title card, chapter opener | Remotion | remotion `spring-pop`; `libraries/title-card` |
| Speaker name, caption bar | Remotion | remotion `lower-third` |
| Panels replacing each other (step 1 → step 2 → step 3) | Remotion `Series`; or `{slide}` blocks | remotion `series-transition`, `wipe` |
| A process in stages with a timer | Remotion `measureSpring` chain | remotion `spring-chain` |
| Existing footage or a screen recording | `{video}` (captions, poster), `{youtube}`; a GIF with `{animation}` and `:still:` | — |
| Static diagrams and mind maps | ```` ```mermaid ````, `{markmap}`, PlantUML; no animation needed | — |

## When nothing here fits

Pick by the picture with the table in `libraries.md`, find the nearest gallery scene, and keep the rules in `SKILL.md`. Things not available today: LaTeX inside scenes and formula morphing; handwriting text along its strokes; images, audio and video inside Remotion scenes; real map data (bring your own GeoJSON with the lecture); interactive controls inside a scene (scenes follow the step and the narration; learners interact through `{run-panel}`, `{step-run}`, `{predict}`, `{quiz}`, `{exercise}`).
