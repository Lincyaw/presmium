# From thesis to storyboard

How to decide what an animation says before deciding how it moves: the sentence it proves, the picture that proves it, the order of the beats, the narration over them and the review that shows whether a stranger got it. `lengths.md` (this folder) covers the motion itself and what each second of a 1- to 60-second piece shows; `scenarios.md` covers which picture suits which teaching topic; `storyboards.md` holds 34 filled-in storyboards for popular science, papers, courses, data stories and products; `procedural.md` covers motion computed from mathematics (inverse kinematics, physics, curves, fields) and how to keep it seekable. The worked example is the gallery document `gallery/story/lecture.json`: a narrated two-minute flow-matching explainer whose steps are its storyboard and whose numbers come from a real training run.

## The process

Each stage ends in a check; don't start the next stage before the check passes. Writing code is stage 6, not stage 1.

| Stage | Write | Check |
|---|---|---|
| 0. Brief | Audience and what they already know; what they believe before and should believe after; the form that matters most (web page, slides or video); the length | Before and after fit on one line each |
| 1. Thesis | "看完后，观众明白 X，因为他们看到了 Y" (After watching, the viewer understands X because they saw Y), X in 25 汉字 or fewer; the same claim as And–But–Therefore | Someone who has seen nothing restates it; the ABT has exactly one But |
| 2. Central picture | Three candidate pictures; keep the one in which X becomes a visible property that changes. Draw the money frame: the one still that proves X | Shown for 3 s to a cold viewer, the money frame alone gets something close to X back. If it needs a caption, keep looking |
| 3. Shape | A narrative shape; where its turn falls (usually 40–60% in); one spatial convention; one meaning per colour; the misconception to confront and the parts to name first | The turn is a change in the picture, not a sentence |
| 4. Storyboard | One row per step: the rest frame (the still), what moves, what the viewer now understands, why | The strip of rest frames at thumbnail size tells the story with no sound |
| 5. Script | The narration of each step; when its words come; cues | Read aloud with a timer: each step's narration fits its state, or the state is lengthened on purpose |
| 6. Animatic | The scene drawing only each state's rest frame, with cuts between them; the narration attached; build and export | The durations add up to the length; every payoff rests at least 2 s |
| 7. Motion | The movement between rest frames, one transition at a time, by `lengths.md` | Every motion's why says what it means (cause, the same object, converging); delete the ones whose why is "looks nice" |
| 8. Review | Cold viewers, cheapest test first (below) | Two of three retell the thesis in their own words and get the prediction question right |

Studios work the same way: script, storyboard, an animatic timed against scratch audio, then animation (Thomas and Johnston, *The Illusion of Life*, ch. 3; Catmull, *Creativity, Inc.*, ch. 5). In Presmium the animatic is cheap: a scene whose states draw their final frames, the real narration and `presmium-lecture export`.

## 1. Write the thesis

- **A claim, not a topic.** "讲讲缓存" can't be storyboarded; "缓存让重复读取变快，因为第二次取同一本书只要伸手到桌上" can. One sentence, a point of view and a stake (Anderson, *TED Talks*, the throughline: 15 words or fewer; Duarte, *Resonate*, the big idea).
- **Test it as And–But–Therefore.** And, and, and is a list; despite, however, yet has too many turns. The But makes the viewer want the Therefore (Olson, *Houston, We Have a Narrative*; <https://www.sesync.org/resources/communications-toolkit-and-therefore-statement>).
- **The because-clause names the picture.** "因为他们看到了 Y": if Y is "an explanation", there is no picture yet.
- **Know what the viewer believes now.** A private intuition (the sky is blue because of the sea, 50/50 in Monty Hall, a bigger step is faster) is surfaced by asking for a prediction first: clear expositions left post-test scores where they were (about 6/26) and were rated "clear", while versions that voiced the misconception roughly doubled them and were rated "confusing" (Muller and Sharma 2007, <https://openjournals.library.sydney.edu.au/IISME/article/view/6345>). A public myth (mRNA changes your DNA) is answered fact first: the fact as the title, the myth said once with a warning, then the cause that replaces it (*The Debunking Handbook 2020*, p. 11, <https://sks.to/debunk>).
- **For data, the thesis has a number and a stake**: "1990–2015 年线左侧从 43% 降到 13%，但 2015 年后几乎不动" (Knaflic, the big idea, <https://www.storytellingwithdata.com/blog/2014/02/whats-big-idea>).

## 2. Find the central picture

The strongest pieces in the gallery have one picture that is the argument: in the Fourier fit, whiskers from the outline to the pen make "error" visible and the readout is their RMS; in problem → solution, the files that cause the trouble are the same objects that merge into the document. The pieces that needed many words were the ones without such a picture.

- **The claim becomes a visible property that changes**: a length (a time bar's slices, a whisker), a count (dots in a circle, pips per question), a position (a ball on a curve, an escape layer's height) or an identity (the same objects become the answer).
- **Numbers come out of the picture.** A readout is computed from what is drawn (the area left of a line, the RMS of the whiskers, the lines of code on screen) and changes at the instant its cause lands, next to it. A number that can't be produced (10.22999999543 MHz) becomes the picture itself, held. Every number needs an anchor the viewer can feel: a marble, a small town, 1,000 songs.
- **Concrete before abstract.** One photon, one door, one request before the law; the formula comes last, as a label on a picture already understood (Sanderson, <https://www.3blue1brown.com/faq/>). Name a part only after the picture has shown it, and introduce at most about one new term a minute: in a study of 650 adults jargon lowered understanding even with definitions on hand (Shulman et al. 2020).
- **Two linked views are allowed**, sharing colour and clock, with one marked as the argument: code and its memory diagram, a circuit and its energy staircase, the viewer's wrong model and the right one morphing out of it.
- **An analogy shows where it breaks**: say it on the reading page or in a footnote step (Glynn's teaching-with-analogies, step 5). "Greenhouse" glass blocks convection; CO₂ restricts radiation.
- **Real UI for tutorials, metaphor for newcomers.** Learners must find the panel in their own app, so tutorials use the full real screen, dimmed and zoomed, not cropped or redrawn (van der Meij 2000: 25% less training time, 60% better retention). A metaphor for a new category lasts one idea, then hands over to the real thing (Dropbox's "magic pocket" gives way to the real folder by about 30 s).

## 3. Choose a narrative shape

| Shape | Use when | Beats | Example |
|---|---|---|---|
| And–But–Therefore | One claim in 10–30 s | what is known → what breaks it → what follows → hold | Watson and Crick 1953 |
| SCQA (Minto) | The viewer knows the situation and wants the answer | situation → complication → question → answer → 2–3 supports | 3Blue1Brown, "But what is a neural network?" |
| Predict, observe, explain | A confident wrong intuition | everyday scene → question with 2–3 options, held → the picture → where the wrong idea fails → mechanism → transfer case | Veritasium, where trees get their mass |
| Fact-first debunk | A circulating myth with emotion | the fact as the title → mechanism → the myth once, with a warning → why it can't be → the fact again | CDC on mRNA vaccines |
| One-picture proof | Maths, or a mechanism with one invariant | the object → one constraint → let it move → read the answer off the picture → the formula | 3Blue1Brown, e^(iπ) by dynamics |
| Picture → formal | A proof with a counting or geometric picture | small cases → the picture of one case → the move n → n+1 → doubt (pictures can lie) → the formal step, each term coloured like its region | Visual proof of 1 + 3 + … = n² |
| Invariant story | Why an algorithm or protocol is correct | the claim → true at the start → each step re-checks it → an adversary fails → drop the precondition and watch it break | Dijkstra, MIT 6.006 L13 |
| Worked → faded → solo | A procedure | subgoal labels → one worked run → the last step left to the learner → a solo exercise | Khan Academy algorithms |
| Ladder of abstraction | A parameter controls behaviour | one concrete run → change it, predict → every value at once → back down at the threshold | Bret Victor; Distill, "Why momentum really works" |
| Naive → better → clever | Efficiency or design trade-offs | the obvious method with a cost readout → a tweak that changes a constant → the idea → cost curves side by side | CS50's phone book |
| Bug story | Debugging, a program's model | the symptom (predict the output) → a wrong hypothesis ruled out → trace the state → the model → fix → verify | Python Tutor aliasing |
| Follow the protagonist | A process with stations | meet the traveller → one station per step, the rest frame shows where it is → the end → zoom out | 回形针《关于新冠肺炎的一切》 |
| Journey of one request | How a system works | one user, one action → numbered stops along a fixed map → a second pass that differs (cache hit, failure) | ByteByteGo; Google's Chrome comic |
| Scale journey | Ratios of size, mass or time | a human anchor → constant time per factor of ten with a ruler → landmarks → back, faster | Eames, *Powers of Ten* |
| Counterfactual | A hidden dependency | it works → how → the precision it needs → what would break it, with its size → the fix | GPS and relativity |
| Discovery as detective story | Why something is believed | the puzzle as it looked then → real wrong answers → the decisive idea → what it unlocked | Veritasium, "Math's fundamental flaw" |
| One picture over time | Data, history, a trend | the encoding → run time at a constant rate → stop at 2–3 turning points → today → one takeaway | Rosling, "200 countries, 200 years" |
| Guess, then reveal | The audience holds a wrong prior about data | empty axes → a ghost guess held 1.5–2 s → the data draws over it → the gap named | NYT "You Draw It" |
| Race with one mover | Ranks change a lot | field and rule → all grey but the mover → constant rate → pause at the pass → result → a counter-view | CO₂ emitters |
| Juxtaposition, encoding switch | "A differs from B"; a familiar chart misleads | A → B on the same scale → overlay → measure; or morph each mark into the honest encoding | "Land doesn't vote, people do" |
| Martini glass | One finding plus data worth exploring | question → encoding → guided reveals → full chart held → the reader explores | NYT budget forecasts; in Presmium: video and slides are the stem, the web page is the bowl |
| Problem–agitate–solve | A familiar, tolerated pain | the chore → it spreads on the same objects → the product acts on those objects → proof and action | Slack, "So yeah, we tried Slack" |
| StoryBrand, switch | A new category; replacing an incumbent | a character wants something → problem → guide → three-step plan → action → failure avoided → success | Dropbox 2009; iPhone 2007 |
| Do the last thing first | Demos and tutorials | the finished result → back to the start → fewest steps, each result held → next task | Linear Agent launch |
| Heartbeat | Launch spots, release montages | start high, several peaks, the brand throughout | Linear Releases |
| Two acts | A method and its fix | problem → mechanism → answer → the flaw it leaves → the second answer | The flow-matching example (below) |
| Result-first reveal | A paper teaser of 60 s or less | the result → the input → one mechanism move → the result beside the baseline → title card | NeRF teaser |
| Mechanism walk | A method paper, 1–5 min | claim and input → one example through the pipeline → output → baselines one by one in the same view, each failure named → what it enables | NeRF (Tancik), mechanism done by 1:00 |
| Bottleneck first | A systems paper | the workload → the measured waste → the borrowed idea → its price → end to end against baselines and an oracle | vLLM, SOSP 2023 |
| Gap → instrument → finding | A benchmark or dataset paper | what existing data can't answer → what is new and why to trust how it was made → what models do on it | ImageNetV2 |
| Puzzle → reframe | A theory result | a puzzle → a reframing → the statement as a picture → why it is hard → the key idea → what it doesn't say | Quanta on the Kakeya conjecture |
| Claim on trial | An empirical, analysis or negative-result paper | the takeaway → the accepted belief → the observation that cracks it → a model of when → an intervention that switches it → scope | "Are emergent abilities a mirage?" |
| Trial summary | A clinical video abstract | current care and its problem → design (n, arms, endpoint) → the primary result against the comparator → safety → what was not compared | NEJM Quick Takes |
| Menu | A survey or tutorial | one lens → a menu of 3–4 stops → each stop on the same map → back to the menu | Jia-Bin Huang, diffusion models |
| Human question → aim → finding | A thesis talk (3MT) | a relatable question → the stakes → one aim → the finding → so what | 3MT winners |
| 起承转合 (kishōtenketsu) | No conflict to stage; one idea shows a new side | introduce → develop → twist (the same idea used in a new way) → conclude | Nintendo level design |

Paper videos are designed to the venue's clock (SIGGRAPH's Fast Forward 20 s narrated or 10 s silent, a CHI preview 30 s, ECCV summaries 60–120 s, a Three Minute Thesis 3:00, journal video abstracts 4–5 minutes), say one thing to remember, show the baseline in the same frame and tag every number with its table. Result first suits short pieces and method or systems papers, not theory (open with the puzzle), clinical abstracts (the design comes first, because credibility depends on it) or a thesis talk (a human question). By length: 10 s is ABT compressed into setup, change, result, hold; 60 s is ABT, puzzle first or predict first; 3–6 minutes is 起承转合 or a chain of causes inside SCQA, with the misconception at the turn; promos use problem–agitate–solve, the sparkline or the heartbeat; data uses one picture over time shaped establisher → initial → peak → release (Amini et al., CHI 2015).

## 4. Storyboard the rest frames first

In Presmium a step rests on the final frame of its state, and that frame is also the slide and the still on the web page. So the storyboard is a strip of rest frames, and the motion is what gets the picture from one to the next.

- **One step = one state = one idea**: one or two sentences of narration over 6–15 s in a teaching segment, less in a promo. Mayer and Chandler's lightning lesson in 16 segments of one or two sentences, each ended by a Continue button, is the model: segmenting d = 1.36, naming the parts first d = 1.00 (Mayer and Moreno 2003, <https://www.uky.edu/~gmswan3/575/9_ways_to_reduce_CL.pdf>). On the web and on slides the reader is that button; in the video the hold after a payoff stands in for it.
- **Every rest frame makes sense alone**: a 3-second glance tells what it shows (Duarte's glance test; Disney's staging, checked in silhouette). The exception is a prediction step, whose still is an open question with options on purpose; its answer is the next step, and nothing in it gives the answer away (no updated label, no highlighted edge, no output, no blank shaped like the answer).
- **Leave rhythm a trace.** Acceleration, a long hold or a montage are invisible in a still, so the rest frame keeps what the motion did: a pip per round, a chart point per round, the ghost of the earlier state, a trail, a time-space diagram. Prefer pictures that lay time out in space; learners scrub back to what vanished (Kim et al. 2014: 23% of interaction peaks).
- **The worksheet**, filled top to bottom before code:

```
A. Brief    title; length and why; audience and what they know; before → after; misconception; parts to name first
B. Claim    看完后，观众明白 ___，因为他们看到了 ___。 | ABT: ___，而且 ___；但是 ___；所以 ___。 | shape; the turn at ___ s
C. Picture  the central picture; the money frame; each readout and how the picture computes it;
            the spatial convention; one meaning per colour; the source of every number; a 3-second glance: what a cold viewer said
D. Steps    | # | State | Start–end | Rest frame | What moves (one thing; cause → effect) | Viewer now understands |
            | Viewer does (predict, quiz, run) | Narration | Words come (with / after / cue) | On-screen text (one line at most) | Why |
E. Checks   durations add up; the thumbnail strip reads silent; read-aloud timing; animatic screened; the review results
```

Put the filled worksheet in the piece's reading-view notes, as the gallery does: the next author sees why each beat exists.

## 5. Write the script

- **Budget by rate.** Plan 3.5 汉字 a second, holds included (English: about 2.5 words). The Edge voice zh-CN-XiaoxiaoNeural speaks about 4.3 汉字 a second, the rate Chinese newscasters hold at near-full intelligibility (Chan and Lee 2005); the flow-matching video this guide studies speaks 4.9, nearly without pause. A step lasts the longest of its state, its narration plus the trailing pause, and its minimum hold, so narration longer than the state stretches the step without asking.
- **Write to the corners of the picture**: say what the picture can't show (cause, size, consequence), never what it shows. "如图所示，红点越来越多" says nothing; "一个病人传三个，三个传九个" says the rule.
- **Speak the words; don't print them over moving pictures.** Narration with the picture beats text with it (modality d = 1.17); narration plus the same text on screen is worse than narration alone (redundancy d = 0.69). One or two key words beside the part they name are fine (spatial contiguity); captions are a separate track, not on-screen text.
- **Say it while it happens** (temporal contiguity d = 1.30): the narration and its motion share a step. `narrationStart: "with-animation"` (the default) for a mechanism; `"after-animation"` when the picture should land first and the words name it (a result, a surprise); a narration cue on the key word (`point` or `spot` to aim the eye, a pause timed in `production.cueTimings`) when the words lead.
- **Questions turn the acts**: "那有没有可能……直的呢？", "还剩最后一个问题". A 1–2 s silence before the turn, and 6–10 s with a spoken "先暂停，写下答案" after a prediction question in a video (the web view's prediction block waits by itself).
- **Weed**: interesting facts off the causal chain, background music under a dense explanation, decorative clips (coherence d = 0.90). A tangent comes back to the question within its step or moves to the reading page.
- **Read d values as direction, not dose**: a 2025 meta-analysis of Mayer's studies found an average g = 0.37, smaller for primary-school and graduate learners, and the modality benefit narrows when learners set the pace.

## 6. Pace

- In a teaching segment: one step per idea (6–15 s), one change every 1–3 s inside it, the payoff longer than its neighbours, a pattern break (a new view or scale, a question, a silence) every 60–90 s, and a segment under 6 minutes, because median watch time stops growing there (Guo, Kim and Rubin 2014, 6.9 million edX sessions). Put a question at every boundary between segments: a 21-minute lecture in four segments with questions between them halved mind wandering and raised the final test from 68% to 90% (Szpunar, Khan and Schacter 2013).
- **Rhythm carries meaning.** Rounds that get shorter read as converging (the Fourier fit; binary search's ten halvings); a constant rate encodes a log scale or a steady clock (Powers of Ten goes out at one decade per 10 s and comes back at one per 2 s, because by then the viewer knows the way); a montage of 1.5-second atoms reads as energy; the mechanism beat slows down while the montage speeds up.
- **Teaching moves are slower than promo moves.** A move the learner must track (a swap, a label rolling, a token travelling) takes 600–900 ms with a dwell; decorative moves keep the `lengths.md` durations. Keep teaching rest frames still, or let only a non-argument element breathe: a drift competes with reading.
- **Pause, don't slow down**, at a turning point in data: slowing the clock is editorial emphasis.

## 7. Turn interaction into steps

Interactive explainers let the reader drag; a lecture video can't. Script the manipulation instead, one manipulation per step:

- **Play with the input to reveal the mapping.** The flow-matching video colours the noise by position, rotates it and drops a stone into it, and the logo inherits the colours and the ripples: the learned map is continuous, shown without a word. The gallery's example does the colouring.
- **A parameter becomes a dial in the frame** whose value the steps set: η 0.1, 0.45, 0.9, 1.1 in four steps, the same start and the same bowl each time, so only η changes.
- **A drag becomes a scripted path** of the target (the point an arm reaches for, the pointer that moves a knob), computed from the time like any other motion.
- **Keep the real interaction on the web page**: a prediction block, a quiz, a run panel where the learner sets the input (Naps et al.'s "changing" level, the one that predicts learning; Hundhausen et al. 2002: what learners do with a visualization matters more than how it looks). The video and the slides are the stem of a martini glass and the web page is its bowl, but nothing important hides behind interaction: "if you make a tooltip or rollover, assume no one will ever see it" (Archie Tse, NYT, Malofiej 2016).

## 8. Be honest

- **Numbers from the run, seeded**: a simulation prints the counts it actually produced (about 100 and 200 out of 300, not exactly), and the rest frame is the same on the web page, the slide and in the video.
- **Sources in the frame**: the dataset and its year on screen, the precise values and caveats in the reading view; mark estimates 估算 and illustrative values 示意.
- **Where you stop is what they believe** (Hullman and Diakopoulos 2011): the last rest frame is the honest one (three rankings side by side, not only the one that assigns blame). Don't join two series with different definitions; teach a log axis aloud or don't use one (41% vs 84% read a COVID chart correctly); show uncertainty as outcomes people can count and label every band.
- **Motion means new data**: never move a value that isn't changing (the NYT election needle).
- **Show the trade-off**: an approximate index that misses one neighbour, a straight path that crosses others. Showing the flaw makes the rest believable.

## 9. Review from a cold seat

Cheapest first; never ask "看懂了吗" (people say yes when they haven't), and never review with the team that made it: people tapping a song's rhythm expected listeners to name half the songs, and listeners named 3 of 120 (Heath and Heath, *Made to Stick*).

| Test | How | It catches |
|---|---|---|
| Glance | Each rest frame for 3 s: "what does this show?" | Frames that need their narration |
| Thumbnail strip | All rest frames in a row, small, no sound | A story that isn't in the pictures |
| Mute | The animatic without sound: "what changes?" | What the picture doesn't carry; what the narration needn't say |
| Radio | Sound only | "这里", "如图" pointing at nothing |
| Pause | Stop mid-motion and on each rest frame: "what happens next?" | Motion with no cause |
| Prediction probe | Stop before the turn and ask for a guess | A turn that doesn't land |
| Retell | "讲给一个没看过的人听" | The thesis, in their words |

A cold viewer saying "clear" is not a pass: Muller's clear video raised confidence and taught nothing. A changed prediction and a retold thesis are. A subagent that sees only the exported rest frames, in order, and has to predict each next step and state the thesis is a cheap first cold viewer; then fix the first step where anyone got lost and screen again.

## The worked example: flow matching

`gallery/story/lecture.json` is a 115-second narrated explainer built by this process, after a 小红书 video that explains flow matching unusually well ("flow matching：将生图路径，拉直！"). What that video does, and the example copies:

1. **The title is the thesis**: straighten the path from noise to image, so few steps suffice.
2. **One picture all the way through**: space-time in three dimensions, time as the third axis, the noise plane (t = 0) and the target plane (t = 1) facing each other along it, each sample's path a curve between them. Flattened to 2D the paths lose what they are, curves through time. Every new idea is a change of that picture: curved paths → straight training lines → the lines cross → the paths bend again → Reflow straightens them.
3. **One, then many**: one path → its tangent at one point ("this is the velocity") → arrows everywhere (the field) → only then dx/dt = v(x, t), as a label.
4. **One iteration in detail, then the loop**: a time ruler with its step size stays on screen; one particle, the network's arrow, one step, the marker moves on.
5. **Convergence by overlay**: Euler with 4, 8, 16 and 32 steps on the same curve, the end error read off each.
6. **Formula terms coloured like their arrows**: in L = ‖v − (x₁ − x₀)‖², v has the network arrow's colour and x₁ − x₀ the target arrow's.
7. **Numbers are counters of the process** ("第 30,000 轮 loss 0.67", "2000 个粒子"), and the demo is the author's own, stated exactly (four layers of 256, 30,000 rounds), so it is believable.
8. **The flaw at one point**: zoom on one crossing; the network's arrow is the average of the lines through it.
9. **The fix as numbered steps on the same planes**, and the result as a side-by-side.

The example's worksheet is in its reading view. Its data come from `gallery/story/scenes/data/flow-matching.py` (a 200,000-parameter MLP trained for 30,000 rounds, then Reflow), and the scene `scenes/flow-matching.ts` (Three.js) reads every readout from that file. The camera moves between the states: round the planes in the intro, above the one path for Euler, through the noise plane to face the logo for the result. Where the subject is too small for the picture (the path bends 0.25 across a time axis 3.4 long), space is magnified about it for those states rather than cut to a flat view. Its narration is synthesized with the Edge voice and committed as the document's speech cache.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| A topic or a title first ("群体免疫") | The concrete case first, the name after the payoff, if at all |
| A list of facts (and, and, and) | Find the But |
| Narration describing what is visible | Cause, size, consequence |
| The narration printed over the motion | Speak it; one key word beside its part |
| Two things moving at once | One focus; the other waits |
| The biggest motion on bookkeeping (heap sift-downs, sparkle, crowds of requests) | The argument gets the largest motion; bookkeeping snaps into place |
| Motion that erases history | Lay time out in space; keep traces in the rest frame |
| A clear, polished piece that changes nothing | Stage the wrong prediction first |
| A metaphor with false physics (a rolling ball has momentum; beads leaving the battery suggest current is used up) | List what the metaphor claims besides the point, and check each |
| A number typed into the scene | Compute it from the state that draws the picture; label illustrative values |
| A feature tour, a changelog read aloud | One thing per piece; the rest as a stack ("还有 9 项") |
| A logo sting first | The result or the problem first; brand by 5 s as a small docked mark |
| A predict step with no time, or one that leaks the answer | A held question with options; the answer on the next step |
| A hook from the news on every frame | The news in the first step only; the rest timeless |
| A lone-genius history | One dated step that credits the chain |
| A long piece with one rhythm | Change shot length, view or scale at each part; silence before the turn |

## Sources

- Story and thesis: Anderson, *TED Talks* (2016); Duarte, *Resonate* (2010) and the glance test <https://www.duarte.com/resources/guides-tools/the-glance-test/>; Olson, *Houston, We Have a Narrative* (2015); Minto, *The Pyramid Principle*; Heath and Heath, *Made to Stick* (2007); Loewenstein 1994, "The psychology of curiosity"; Dahlstrom 2014, PNAS, <https://pmc.ncbi.nlm.nih.gov/articles/PMC4183170>
- Learning: Mayer and Moreno 2003 (above); Tversky, Morrison and Bétrancourt 2002, <https://faculty.washington.edu/aragon/classes/hcde411/w13/readings/Tversky_AnimationFacilitate_IJHCS02.pdf>; Muller and Sharma 2007 (above); Crouch, Fagen, Callan and Mazur 2004 (predicting before a demonstration); Guo, Kim and Rubin 2014, <https://www.cs.rochester.edu/hci/pubs/pdfs/edX-MOOC-video-production-and-engagement_LAS-2014.pdf>; Szpunar, Khan and Schacter 2013, <https://pmc.ncbi.nlm.nih.gov/articles/PMC3631699/>; Kim et al. 2014, <https://iis.seas.harvard.edu/papers/kim14video.pdf>; Hundhausen, Douglas and Stasko 2002; Naps et al. 2002; Renkl (faded examples); Kalyuga et al. 2003 (expertise reversal)
- Explainers: 3Blue1Brown FAQ and SoME1 results <https://www.3blue1brown.com/blog/some1-results>; Kurzgesagt <https://kurzgesagt.org/youtube/>; 回形针's process <https://www.36kr.com/p/5289484>; *The Debunking Handbook 2020* <https://sks.to/debunk>; Bret Victor, "Up and down the ladder of abstraction" <http://worrydream.com/LadderOfAbstraction/>; Julia Evans on confusing explanations <https://jvns.ca/blog/confusing-explanations/>
- Data: Segel and Heer 2010 <https://idl.cs.washington.edu/files/2010-Narrative-InfoVis.pdf>; Hullman and Diakopoulos 2011 <https://mucollective.northwestern.edu/files/2011-VisRhetoric-InfoVis.pdf>; Robertson et al. 2008 (animation versus small multiples); Kim, Reinecke and Hullman 2017 <https://idl.uw.edu/papers/explaining-the-gap>; Archie Tse, Malofiej 2016 <https://github.com/archietse/malofiej-2016/blob/master/tse-malofiej-2016-slides.pdf>
- Papers: Peyton Jones, "How to give a great research talk" <https://pub.sergev.org/doc/giving-a-talk-slides.pdf>; Fatahalian, "Tips for giving clear talks" <https://www.csie.ntu.edu.tw/~johnson/files/cleartalktips.pdf>; Jia-Bin Huang on figures and transitions <https://x.com/jbhuang0604/status/1665738070002483201>, <https://x.com/jbhuang0604/status/1865199644415832424>; SIGCHI video guide <https://sigchi.org/resources/guides-for-authors/videos/>; IOP video abstracts <https://publishingsupport.iopscience.iop.org/questions/editorial-guidelines-for-video-abstracts/>; 3MT rules <https://threeminutethesis.uq.edu.au/resources/3mt-competitor-guide>
- Product: Wistia on length <https://wistia.com/blog/optimal-video-length>; TechSmith Video Viewer Trends 2024 <https://assets.techsmith.com/docs/TechSmith-Video-Viewer-Study-2024.pdf>; Google and Ipsos ABCD (in `lengths.md`); van der Meij 2000 <https://research.utwente.nl/en/publications/the-role-and-design-of-screen-images-in-software-documentation/>; the C4 model <https://c4model.com/>
