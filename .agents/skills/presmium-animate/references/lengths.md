# Animation by length: 1, 5, 10, 30 and 60 seconds

Animations come in five lengths. The shorter the piece, the more atomic it is: a 1-second atom is one move, a 5-second piece one message, a 10-second piece one claim with its evidence. The longer pieces are films made of the shorter ones: a 30-second spot or paper teaser, a 60-second promo or paper video. This page says what each second of each length shows, how to keep the motion logical, and how to build and export such pieces in Presmium.

Every piece below exists in this skill's gallery. `gallery/lengths/lecture.json` shows each animation once, one section per piece, with its beat sheet (what happens in which second, and why) in the reading view; its 30- and 60-second tiers list the films shot by shot, naming the piece each shot comes from. `gallery/films/lecture.json` is the four films themselves, for presenting and video export. The scenes are `gallery/lengths/scenes/<length>/<name>.ts`; the 1-second atoms are also GSAP functions in `gallery/lengths/scenes/kit/atoms.ts`, and the longer GSAP pieces are built by calling them. Copy the `kit/` folder along with any scene that imports it.

## Rules for every length

1. **Setup, change, result, hold.** Every piece and every beat inside it has the same order: show what is there, change one thing, show the result, and hold the result still long enough to be read.
2. **One focus at a time.** At any moment, one thing moves and everything else rests. Choreography with several simultaneous motions loses the eye.
3. **Cause before effect.** The cause moves first; the effect starts as the cause arrives (a link draws to B, then B lights up; a click lands, then the result appears). Cause and effect are never on screen at the same moment.
4. **Keep identity.** When something changes place or form, move or morph it; do not fade it out and fade a copy in. Between unrelated things, cut. A highlight that follows an actor makes the eye follow too.
5. **One spatial convention per piece.** For example: left is before, cheaper or the baseline; right is after or ours; up is better. Never swap it between shots.
6. **Show, don't write.** Use shapes, icons, logos, product UI and numbers before words. When there must be words, show at most one short line at a time, at no more than 9 Chinese characters or 20 Latin characters a second, and keep it on screen until it can be read twice (about 0.6 s per word). A chart's own labels count as words.
7. **Hold the payoff.** At least 1.5 s on the result of a 5-second piece, at least 2 s from 10 seconds up, and 3–8 s on the final frame of a film (the call to action or the title card), because the last frame is the one people pause on.
8. **Size and rhythm.** The hero fills at least 40% of the frame's width or height. Secondary moves travel 50–70% as far as the main one and start 100–200 ms after it. A card is readable within 2.5 s and then holds. A film's rhythm is measured, not felt: shot lengths vary at least 4× (0.3 s hits beside 2.5 s holds; their standard deviation at least a quarter of their mean), at least a quarter of the frames are dead still with one still stretch of a second or more, and no two shots in a row end the same way (spring out, blur out, cut). Equal shots read as slides however good each one is.
9. **Be honest with data.** Bars start at zero. Numbers come from the source, and the source is named on screen. Values made up for illustration are labelled as such.

### Durations and eases

| Move | Duration | Ease |
|---|---|---|
| Press, toggle feedback | 70–120 ms | ease-out |
| Exit | 200–250 ms, shorter than the entrance | accelerate (`power2.in`) |
| Enter | 300–450 ms | decelerate (`expo.out`; Material 3 emphasized decelerate is `cubic-bezier(0.05, 0.7, 0.1, 1)`) |
| Move between two places, swap | 500–650 ms | both ends eased (`power3.inOut`) |
| Draw a line or outline | 400–600 ms | `power2.inOut` |
| Emphasis (grow past size, settle) | 150 ms out + 400 ms back | `power2.out`, then `back.out` |
| Stagger between items of a group | 20–50 ms for UI lists, 60–80 ms for cards and words | — |
| One stage of a data transition | about 1 s, with a short dwell between stages | ease-in-out |
| Typing | 12–15 characters a second | linear |
| Count-up (with `tabular-nums`) | 1.2–1.6 s | `expo.out` |
| Hold before a payoff | 0.3–0.75 s | — |

Linear motion is only for typing, loops and constant drifts. Springs and overshoot mean "new" or "done": use them for one thing at a time (a badge, a delta, a celebration), never for a whole list. Choose a spring by its damping ratio: 1.0 never bounces, 0.7–0.85 reads premium, 0.4–0.6 playful, below 0.3 a cartoon; never spring opacity or colour. In a sequence the next element starts when the previous one is 30–50% done.

### Making it look polished

A plain atom moves one property, stops dead and changes nothing else. These are what the polished atoms add; each is a function of the time, so it stays exact under seeking.

1. **Anticipation, action, overshoot, settle.** Before a big move, go back 3–10% (or shrink to 0.92–0.97) for 15–25% of the move. Calibrate the overshoot by scale: 1–5% for interface parts, 5–10% for the hero of a frame, 15–25% only for mascots and celebrations; settle in one return. Data values never overshoot.
2. **Overlap everything.** Start each part before the last ends; on one object, let the properties arrive at different times (opacity first, position over the whole move, scale 30–60 ms later, color on landing). The same duration for every property is what looks templated.
3. **Speed you can see.** Smears, directional blur, trails and comet tails are computed from the current speed and disappear at rest. Blur peaks at the fastest frame: about 0.3–0.6 cqw on text, 0.8–1 cqw on the whole frame.
4. **Masks instead of fades.** Things rise out of a slot, slide from behind an edge or are uncovered by a clip.
5. **Every impact gets a reaction** within one or two frames: a squash, a ring, sparks, a neighbour pushed away, about a third of the main move's size. An ease-in reads as a slam and an ease-out as setting something down; a film has at most two slams, and a fly-in ends in a real layout slot.
6. **One sweep of light is a material.** A sheen or glow once, at the moment of change, never permanently on. On the light page a white highlight becomes the deepened accent.
7. **Depth from one height value** driving scale, shadow size, blur and fade together.
8. **One clock, several readouts.** A head and its tail, a pointer and the tilt it causes, a pen and the value it shows share one progress, so they read as one mechanism.
9. **Waves from a meaningful origin** (the tap, the logo, the centre), with the total stagger capped and itself eased.
10. **A hold that reads.** A landed title, line or interface stays dead still, and so do the background and the camera: a slow push or a drift is motion, and the stillness is what makes the next move land.

## What each second shows

### 1 second: an atom

One move plus a rest. 0–0.15 s: the state before, for atoms that change something already shown (replace, swap, a morph or an emphasis); 0.15–0.7 s: the move; 0.7–1 s: rest, so the result is seen standing still.

| Atom | Gallery scene | Library | Used for |
|---|---|---|---|
| Enter | `1s/enter` | GSAP (`enter`) | titles, cards, list items |
| Replace | `1s/replace` | GSAP (`replace`) | a state, a number, before → after |
| Swap | `1s/swap` | GSAP keyframes | sorting, exchanging two things |
| Loop | `1s/loop` | `defineScene` | waiting; frame 1000 equals frame 0 |
| Type | `1s/type` | GSAP TextPlugin (`type`) | the command before a call to action |

These five are the vocabulary, and their GSAP functions in `kit/atoms.ts` build the longer GSAP pieces. The polished atoms below add anticipation, calibrated overshoot, a reaction and light (see "Making it look polished"); they last 1 s unless the table says otherwise, and each sits under `fx/<library>/`.

| Atom | Gallery scene | Used for |
|---|---|---|
| Odometer: digits roll on wheels, the low digits turn more, a vertical smear while fast, a click into place | `fx/gsap/odometer` | a result, a metric (instead of a counter) |
| Comet stroke: a tapering light runs from cause to effect, which recoils and rings | `fx/gsap/comet-stroke` | "therefore", flow, data moving |
| Hinge lines: each line hinges up behind its baseline, a glint sweeps the key word | `fx/gsap/hinge-lines` | titles, chapter openers |
| Morph with anticipation: the icon winds up, turns half a turn while it morphs, the button rings | `fx/gsap/morph-anticipation` | a state change (play → done) |
| Neon trace: halo, core and a hot head draw a mark, then the closed shape floods | `fx/anime/neon-trace` | a logo or icon appearing |
| Gooey split: one drop necks and splits into three, each with its icon | `fx/anime/gooey-split` | one source, many outputs |
| Shockwave: a tap sends a wave through a dot field that pushes, grows and tints the dots | `fx/anime/shockwave-lens` | one change spreading everywhere |
| Submit burst (2 s): press, ripple, spinner, flood to success, check, sparks, the label returns | `fx/anime/submit-burst` | a one-click product action |
| Marker emphasis: the key word winds up and springs, a slanted highlighter sweeps behind it | `fx/motion/emphasize-marker` | the key word of a sentence |
| Border beam: a light runs once around a card's edge and powers it up | `fx/motion/border-beam` | the recommended option, a new feature |
| Tilt and glare: an unseen hand tilts a card in 3D, the glare slides the other way, the mark floats | `fx/motion/tilt-glare` | a product or result card |
| Exploded layers (1.5 s): a window turns isometric and its layers separate in depth, with leader lines | `fx/motion/exploded-layers` | a system's layers |
| Threshold ignite: the previous-best line drops and the parts of bars above it light up | `fx/d3/threshold-ignite` | "beats the state of the art" |
| Comet draw: a line chart drawn by a glowing pen that carries the value | `fx/d3/comet-draw` | a training or growth curve |
| Bend into donut (1.5 s): bars join into one strip that bends into a ring | `fx/d3/bend-into-donut` | amounts, then shares |
| Frontier push (1.5 s): new points land beyond the Pareto frontier, which moves out; the won area is hatched | `fx/d3/frontier-push` | better and cheaper |
| Particle logo: scattered particles gather into the mark | `fx/three/particle-logo` | a logo reveal |
| Glass card: a light sweeps across a glass card in depth | `fx/three/glass-card` | a product hero |
| AI orb: a liquid sphere that breathes and ripples | `fx/three/ai-orb` | an AI feature, a voice or thinking state |
| Neural signal: a pulse runs through a network's layers | `fx/three/neural-signal` | a model, a forward pass |
| Pop burst: a badge springs in with 5% overshoot, sparks and a ring follow the peak | `fx/remotion/pop-burst` | one new thing |
| Impact slam: a number slams down from in front of the camera, the frame shakes, wedges fly | `fx/remotion/impact-slam` | one big number or claim |
| Whip pan: two panels whip past with a horizontal blur; the cut hides in the fastest frame | `fx/remotion/whip-pan` | a transition between features |
| Device hero: a device rises tilted back and settles, the screen wakes, two glints sweep | `fx/remotion/device-hero` | a product appearing |

### 5 seconds: one message

0–1 s: establish the subject; 1–3.5 s: one change; 3.5–5 s: hold. A YouTube bumper (6 s) works the same way: one idea, landed and held for about 2 s.

| Piece | Gallery scene | Family | Beats |
|---|---|---|---|
| Leaderboard insert | `5s/leaderboard` (GSAP) | paper and benchmark promotion | the mascot bobs on the old entry's bar; hops to the next bar, which lights up; the bars from there slide one place right and it drops into the gap; the new bar grows and carries it up, the new name pops in the accent color; it bursts into streaks and notes as the score appears; hold. No words besides the chart's labels: the character's actions tell it. A recreation of a 4.6 s FrontierCS 2 announcement (October 2026) |
| Logo sting | `5s/logo-sting` (Anime.js) | product | 0.2 s breath; the mark draws in reading order; the mark makes room as the letters rise; 1.8 s rest with a 1.5% drift. About 3.5 s of motion and 1.5 s of rest |
| Product hero loop | `5s/turntable` (Three.js) | product | a tablet swings and bobs while satellites orbit; every pose is periodic in `ms / total`, so it loops without a seam |
| One click | `5s/feature-click` (GSAP atoms) | product | the window rises and the pointer arrives as the first beat ends; the press and a progress bar; the result replaces the bar, the preview updates, the pointer steps aside |
| Key result | `5s/key-result` (Motion) | paper | the metric and rows; the baseline grows first; ours grows past it; the gain in one chip and the source; hold |
| Project-page loop | `5s/attention` (D3) | paper | one word lights; arcs to all words at once; arcs thicken by weight, the target lights; everything returns to frame 0 |
| Kinetic type | `5s/kinetic` (Remotion) | motion design | a line springs in letter by letter; items land on an even beat (state length ÷ item count); the line punches |

### 10 seconds: one claim and its evidence

0–2 s: the encoding and context (who, and how to read the picture); 2–7.5 s: two or three stages of about 1 s each, with short dwells; 7.5–10 s: the result, held for at least 2 s. SIGGRAPH 2026's 10-second fast forward has no presenter, so the picture must explain itself.

| Piece | Gallery scene | Family | Beats |
|---|---|---|---|
| Problem → solution | `10s/problem-solution` (GSAP atoms) | product | scattered files land; one is edited and the others get warnings one by one; they fly into one document; lines draw to the four forms; hold |
| Method in one figure | `10s/method` (Anime.js) | paper | inputs; blocks drawn in data order; a pulse fills each block as it passes, and only the key block gets an extra move; the repeated part stacks ("×6"); outputs |
| Data story | `10s/data-story` (D3) | paper, data | axes and their names; the baselines from cheapest to dearest; a line at the previous best; the new results drop in above it; one arrow and one sentence |
| Fourier fit | `10s/fourier` (D3) | science explainer, paper | the outline with its measuring points, and an empty log–log chart of error against circles; one large circle turns once, and a whisker from each point to the pen, drawn as the pen passes, is the error the readout reports; each round doubles the circles (2 … 128): the new, smaller ones pop out at the tip, the last trace dims to a ghost, the whiskers shrink as the pen passes and the chart's point falls with the readout, each round shorter than the last; the chain fades and the fit becomes a filled vector path whose anchors and handles pop in along it, with its path data typed below. Any outline: pass `svg` (or `path`, `viewBox`, `fill`); the series, the error and the Bézier fit are in `kit/fourier.ts` |

### 30 seconds: a short film

| Time | Beat |
|---|---|
| 0–3 s | Hook: a striking picture or the result itself. At least two shots in the first 5 s |
| 3–8 s | Brand or title (within the first 5 s), or the problem |
| 8–22 s | Two or three answer beats of 4–6 s, each a setup → change → result |
| 22–27 s | Proof: one number, or ours beside the baseline |
| 27–30 s | Call to action or title card, held (conference title cards run 3–5 s) |

**Carry, don't replace.** At every boundary between beats something on screen survives and visibly moves or scales into the next beat: the thing pressed becomes the result (a card grows into the page), the subject opens its own world (an iris from it), the camera pushes through one card until it is the scene, the pointer drags the next option in, the cast gathers into the title card. Beats that replace each other read as a slideshow even with perfect rhythm, and a fade or slide between unrelated scenes is not a carry. Bare cuts belong to a burst of hits (three or more within 1.5 s) and the end card. Build a carry from one element that changes, not a second one fading in at its size. The worksheet names the carry of every boundary (`story.md`).

**Transitions have a cause.** A film uses 3–5 kinds of transition, at most a third of its seams are hard cuts, and unrelated worlds never crossfade. A cut lands on the fastest frame with the direction and speed matched across it and the eases mirrored (`power3.in` out, `power3.out` in); a click is a match cut on its rebound. Measured recipes: zoom through a button from 8% to 250% in 0.35 s; an iris from the click in 0.15 s; a dip that darkens 40% for 3 frames; a colour flood in 0.4 s.

A 30-second film needs no new animation. Every shot is a scene of a shorter length with new parameters, new durations, or only some of its states: the gallery's product film (`s30-product`) shows the problem → solution scene twice, its first two states as the problem and its last three as the answer, so the files that cause the trouble are the same objects that become the document. The paper film (`s30-paper`) opens with the 1-second odometer held for 1.5 s, and its problem and idea shots use the same sentence, so the two read as one comparison. Carry between shots; cut only where the cut means something.

**An operated camera.** A still camera over a moving subject feels empty, and a camera that reframes on every beat becomes the metronome. Key the camera where each beat needs it: to follow, key the subject about 0.1 s ahead on a sine in-out; to whip, key the landing point before the subject gets there on an expo in-out. Add a slow two-sine float that is zero in the holds and a decaying shake on landings (`kit/fx/time.ts` `shake`; none in a narrated interface film, where it ghosts the letters). A move over an empty ground doesn't read: put a faint grid or texture farther back. On the beat, accent with speed or scale in one direction rather than jumping sides, which flips the picture's direction every time. Interpolate zoom in log space; past about 20× key where the anchor sits on screen and the log of the zoom, not the camera's world position.

**Product screens.** Rebuild the interface in HTML from the product's real tokens or components, or use its screenshots; never a hand-made lookalike below the product's own finish. A rebuild's strings are data (another language is a table), the camera can close in without pixels, and nothing appears that the film didn't author; magnify it with CSS `zoom` or by drawing at the target size, because a 3D-transformed layer is rasterized at its layout size and its text blurs. Its content is the product's real output. On a 1080p frame captions are at least 56 px, text the narration names or that is meant to be read at least 32 px, measured as rendered (font size × every scale × the camera's zoom); text that is not meant to be read is visibly texture, dimmed or blurred, never in between; a window to be read fills 70–80% of the width, and each operation gets its own close-up, the camera following the pointer between them. A highlight is a soft rounded glow sized to the content, the pointer clicks real element centres, and showing the result early is a lens over the base shot, not a cut away and back (two cuts).

### 60 seconds: a complete promo or paper video

Not a slower 30-second film. Keep the skeleton (hook, brand, problem, answer, call to action) and spend the extra 30 seconds on how it works and on more evidence. Each segment is 8–10 s and is itself a 10-second unit. Vary the rhythm: long shots with little motion for a mechanism, a montage of 1.5-second atoms for energy, and a final hold of 5 s or more.

- Product explainer (`s60-product`): hook 0–4 s, brand 4–9 s, problem 9–17 s, answer 17–27 s, how it works in three parts (write 27–37 s, a montage of four atoms 37–43 s, a summary line 43–48 s, publish 48–53 s), call to action 53–60 s.
- Paper video (`s60-paper`): the key result first 0–5 s, then 10 s each for the problem, the key idea, the method and the evidence, a one-line takeaway 45–52 s, and an 8-second title card.

## Sound and music

- **When.** Promos and films over about 15 s get a music bed; a dense teaching explanation gets none (`story.md`, Weed). Sound only the moments that carry meaning, about five designed effects per 10 s: a click on a real click, a pop on a badge, an impact on a landing, one riser into one hit per film, about two whooshes per film on camera-scale moves. Most cuts have no sound of their own (about 85% in professional films), and cursor moves, scrolls, progress bars, streaming text and rolling counters stay silent under the music; a counter gets one tick, on its final value. About three quarters of on-screen typing is silent; when it isn't, at most about 12 keys a second, one per word above 25 characters a second. Never compose music or synthesise tones in code; without a source, deliver silent and say so.
- **One family, complete coverage.** One material family per film (felt and wood, or glass and plastic), one click, one keyboard. Once a kind of action has a sound, every instance gets it at one level; sounding only some reads as a mistake. A repeated sound draws from four or more takes, never the same twice in a row, ±1–2 dB (a click is one sound, every time). Small interface sounds are dry, mono and centred; reverb on a tiny sound is a cheap tell, and a shared room is for the body and tail of larger sounds.
- **Sources.** The person's own track first. Effects from Openverse, named concretely ("glass shatter", not "dramatic"), clips of 4 s or less; credit their authors in the reading view. Generated music only from a generator the person chooses.
- **Edits.** Enter the track at full intent on its strongest bar, not its quiet intro; the first sound comes within about 0.15 s of the first frame. Choose by feel and tempo, not subject: calm 90–110 BPM, energetic 110–130. Tonal effects (bells, chimes) play in the track's key, pitched at most ±2 semitones; a run of pops climbing 1–3 semitones reads as progress; a boom sits on the root or has no pitch.
- **Beat grid.** Measure it rather than trust the tempo label (a tracker's BPM was 2% off): fit a line through the detected beat times, try the half, single and double grid, and accept one whose beats land on the track's transients within 10 ms with under 5 ms total drift; pin a rare accent to its real transient. Beat n then falls on frame `round(t(n) × fps)`, kept in seconds until that last step; never add a rounded beat repeatedly (at 128 BPM and 30 fps that drifts 2 frames in 32 beats). At most three beats a film move the whole frame (a pump, a shake, a zoom), sixteen or more beats apart on the strongest hits; on the other beats only an element moves, and a kick, a snare or a hi-hat is a candidate, not a trigger. Change the layout on the bar. A move that must land on a hit starts 40–190 ms early, a reaction starts 0–45 ms after, and the hit itself is not eased. A word holds at least one beat; any treatment goes stale after about 6 s. On calm music beat trackers invent a metronome, often at double tempo: cut on changes of phrase and energy instead.
- **Shape.** The loudest moment is the reveal, 30–60% of the way in, never the logo or the last 15%. Before a big hit the music drops 6–12 dB for 0.3–0.5 s and comes back on the hit (in Presmium a short, quieter bed clip in the step before). Many identical hits in lockstep turn into a tone: loosen their timing and vary each one. The ending: the music stops on a bar line, 0.2–0.7 s of near-silence, then one soft note in the track's key 8–20 dB under the peak, ringing 0.5–2.5 s, and no dead air after it; not a stock chord with a shimmer.
- **Sync per kind.** Viewers notice sound 45 ms early or 125 ms late. A click's or impact's attack lands on the contact frame (10–30 ms early is fine); a whoosh peaks on the move's fastest frame, starting 100–450 ms before; a pop at half the element's travel; a riser ends 30–250 ms before its hit. Most files peak after their start, so measure the offset. Take sync times from the scene's own state durations, never retype them, and place sounds only once the picture is locked: a retimed state moves every sound after it. Measure the export's audio offset once (a sharp effect against its frame) and subtract it. A run of effects (ticks on a list) alternates two takes, gets quieter, closes up as the motion speeds up, and becomes one swoosh once it is too dense to count.
- **Levels.** Under a voice the bed sits about −18 dB (volume 0.12–0.14) and ducks further while anyone speaks; keep effects out of 1–4 kHz under narration and never put a hit on a key word. An effect is audible when it is 3 dB (clear at 6 dB) over the bed in its own strongest band, not by overall level; nothing in 2–6 kHz more than 6 dB above the music's loudest there (phones turn harsh first). A bed whose energy is mostly under 150 Hz is inaudible on a phone. Deliver −16 to −14 LUFS for social video and a true peak of −1 dBTP measured on the final MP4 (AAC adds up to 1 dB; master at about −1.5): `ffmpeg -i <file> -af ebur128=peak=true -f null -`; `silencedetect=n=-50dB:d=0.3` finds dead air at the start and end and the longest gap.
- **In Presmium** sound is `production.mediaClips` (see `presmium-present`, lecture production): each clip lies within one step with its own volume, so a bed is cut into per-step clips at bar lines, and ducking is the lower volume of the clips under narration.

## Build and export in Presmium

- **A piece is one section** whose slide shows only the scene: give the section the slide layout `full` (`layout.renderers.slides.layout`). A full slide has no padding, chapter, title or footer; the title stays in the navigation, the outline and the reading view. Put the beat sheet in a text block that no step shows (visible `false` in every step), so it appears in the reading view only.
- **A film is a run of sections, and a section change is a bare cut** in the video. Beats that carry into each other are the states of one scene; start a new section only where the film means a cut. A slide lays out every block that its section shows at any step, so several shots in one section shrink to fit together. Give the film's first section the film's title and the later ones a level below it.
- **Keep the films in a document of their own.** A film reuses scenes, so in the same document every reused animation would appear again in the reading view. In the films document, each file under `scenes/` is one line re-exporting the gallery's scene (`export { default } from '../../lengths/scenes/5s/logo-sting.ts'`), so there is one copy of the code.
- **Beats are states.** Name each beat as a state of the scene's definition and give it its duration; the steps follow the states in order.
- **Silent timing.** Set `production.defaults` to `{ "voiceSource": { "type": "none" }, "trailingPauseMs": 0 }`. Without the zero trailing pause, every silent step adds a 0.5 s gap, and a beat shorter than that is stretched.
- **Reuse a scene in a longer piece** by giving it a new definition with its own durations. To show only some of its states, keep all of them in the definition (so the scene's `at(k)` still names the same state) and let the steps name only the states shown.
- **Parameters** from the component block reach the scene as `parameters` (names, the text to type, the data), so one scene serves several pieces.
- **Logos and product marks**: import SVG files as text (`import mark from './logos/mark.svg?raw'`) and inline them, so they take the token colours. A bitmap (screenshot, photo) goes in an `<img>`: the scene shows its first frame only once every `<img>` has decoded.
- **Export** the document with `presmium build <deck> --to web,lecture` (the document needs the `lecture` renderer and `@lincyaw/addon-lecture` in its plugins), then `presmium-lecture export <deck>` (it writes `dist/script.mp4` when FFmpeg is installed, else a softer `dist/script.webm`). `dist/lecture/script/chapters.vtt` gives each section's time span; cut a single piece from the video by frame number, because `-ss` can land a frame off (at 30 fps, frames `a = start × 30` to `b = end × 30`: `ffmpeg -i <deck>/dist/script.mp4 -vf "select=between(n\\,a\\,b-1),setpts=N/30/TB" piece.mp4`). Take check frames the same way (`select=eq(n\\,N)`).
- **Measure the rhythm** of the export against rule 8: the cut times are `ffmpeg -i <video> -vf "scdet=threshold=6,metadata=mode=print:file=-" -an -f null - | grep scd.time` and the still stretches `-vf "freezedetect=n=-50dB:d=0.5,metadata=mode=print:file=-"` (sum `freeze_duration` over the length). Measure a reference clip the same way before matching its feel.
- **Check by frames**: take frames at every beat boundary and just after every cut, in light and dark, and compare them with the beat sheet.
- **What H.264 loses**: full-frame gradients on a dark ground band, and an accent at 5% opacity disappears; give atmosphere 15–25%.

## Before calling a piece done

- The first 3 seconds show something worth stopping for; the brand or title appears within 5 seconds.
- Each beat has one moving thing, and the cause moves before the effect.
- No line of text moves while it should be read, and none is replaced before it can be read twice.
- The result of every beat rests at least 0.5 s; the final frame rests at least 3 s.
- The total length matches its tier exactly (sum the state durations).
- A loop's last frame equals its first.
- Every number is sourced on screen or labelled illustrative.

## Sources

- Material 3 motion tokens and easing: <https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md>; Material choreography: <https://m1.material.io/motion/choreography.html>
- IBM Carbon motion, productive and expressive: <https://carbondesignsystem.com/elements/motion/overview/>
- NN/g, animation duration: <https://www.nngroup.com/articles/animation-duration/>
- Heer and Robertson 2007, animated transitions in statistical graphics: <https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf>
- Netflix timed text style guides (reading speed): <https://partnerhelp.netflixstudios.com/hc/en-us/articles/215986007-Chinese-Simplified-Timed-Text-Style-Guide>, <https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide>
- Google and Ipsos ABCD (hook, brand in the first 5 s): <https://thinkwithgoogle.com/_qs/documents/8472/ABCD_Complete_V7b_HR_1.pdf>; bumper ads: <https://www.thinkwithgoogle.com/_qs/documents/1664/youtube-bumper-ads-best-practices-video-editing.pdf>
- SIGGRAPH 2026 Papers Fast Forward: <https://s2026.siggraph.org/papers-fast-forward-author-instructions/>; CHI video previews: <https://chi2024.acm.org/for-authors/video-previews/>
- Amini et al. 2015, data video structure: <https://hci.cs.umanitoba.ca/assets/publication_files/DataVideoStorytellingCHI2015_Revision_Final.pdf>
