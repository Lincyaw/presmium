# Putting a scene on the steps and the narration

A scene is one timeline. `:durations:` cuts it into steps, the narration after the block is bound to those steps paragraph by paragraph, and `{cue}` roles in the narration move or act at a word. This file is about making the picture and the words land together, live and in the synthesized lecture (the narration spoken by a speech engine and played over the presentation; setting one up is in `presmium-present/references/lecture.md`).

The timings below were measured on synthesized lectures built with Presmium's test voice, which speaks at a fixed rate (220 ms per Chinese character, 60 ms per Latin letter, 80 ms between words) with the default gap of 500 ms after each paragraph. The rules (when a step starts, how long it lasts, when the lecture waits) do not depend on the voice; with a real voice only the lengths of the sentences change.

This skill's `gallery/timeline/` holds one section per rule, each with a scene whose dots light up one per step, so the picture shows which step is on. To hear the rules, copy it into the project as described in "The gallery" in `SKILL.md`, add `lecture` under `renderers`, `@lincyaw/addon-speech` under `plugins` and a voice (`renderers.lecture.voice`), build with `--to web,lecture` and read its `track.json` (see "Checking it").

## The model

```md
(merge)=
:::{scene} bpe-merge
:durations: 1.2, 1.2, 1.4
Three words, merged pair by pair.
:::

Step 0's narration.

Step 1's narration.

Step 2's narration.
```

`(merge)=` is the block's label, which cues use to aim at it.

- **Steps.** `:durations:` with n entries gives the block n steps, numbered 0 to n − 1. Step k is the part of the timeline from `at(k)` to `at(k + 1)`; `at(0)` is 0 and `at(n)` is `total`. In the scene file, put step k's tweens at `at(k)` and let them end before `at(k + 1)`: the player clamps the position to the step, so anything later is cut off when the step is shown settled.
- **Narration.** The k-th paragraph after the block belongs to step k. Paragraphs past the last step all belong to the last step; paragraphs before the first block of the section belong to step 0.
- **Live presenting** (the present view or the slides). Going forward to step k plays `at(k)` → `at(k + 1)` in real time; going back shows step k − 1 settled at its end. The document view (the scrolling web page) shows the end and gives the reader a play button and a scrubber.
- **Synthesized lecture.** Each step starts with its first word, and the scene plays the step's part from there. A step lasts as long as its narration plus the gap between paragraphs (500 ms), and **at least as long as its duration**: when the words end first, the lecture holds silently until the animation has played.
- **Video export** (of the lecture). Frames are taken on the lecture's time, so the scene must look the same at the same time however it got there (see the rules in `SKILL.md`).

## Choosing durations

Measured on the synthesized lecture (test voice, gap 500 ms). The last column is the section's label in `gallery/timeline/lecture.md`, written `(label)=` above its heading:

| Situation | What happens | Do | Gallery section |
|---|---|---|---|
| One paragraph per step, animation shorter than the words | Each step lasts words + gap; the animation plays at the first word and stays settled | The usual case | `one-per-step` |
| Animation longer than the words (`4s` for a two-character sentence) | A silent hold of about 3 s after the sentence | Shorten the duration, or say more in that step | `long` |
| Fewer paragraphs than steps | The step without words lasts the gap, then holds until its animation ends | Fine for a short visual beat; otherwise add a sentence | `fewer` |
| More paragraphs than steps | The extra paragraphs are said on the last step, with the picture settled | Add a step, or merge the paragraphs | `more` |

A duration is how long the motion of that step takes, not how long the step is on screen. Keep it close to the time the motion needs (0.4–1.5 s for most atomic moves) and let the narration set the pace.

## Moving at a word: `{cue}`

The first word of a paragraph starts its step. To move on in the middle of a sentence, put ``{cue}`next` `` before the word:

```md
First the 5 and the 2, {cue}`next` they swap, {cue}`next` and the 5 moves on.
```

One paragraph, three steps: the scene's step 1 starts at "they", step 2 at "and". A `next` only moves earlier; it does not renumber the paragraphs. The k-th paragraph still belongs to step k, and when a cue has already reached that step, the paragraph is said on it without another move. Measured: a paragraph with one `next`, then two more paragraphs, gave step 1 at the cue's word, the second paragraph on step 1, and the third paragraph moving to step 2. So either give a scene all its steps inside one paragraph with `next`, or keep one paragraph per step and use `next` only to move a little before the next paragraph starts. Gallery section: `cue-next`.

When a `next` comes before the current step's animation has played, the lecture moves on anyway, and the build warns at that paragraph (`f` is the section's id, its label; gallery section `early`):

```
lecture.md:90  warning  lecture script: {cue}`next` moves on 2400 ms before the animation of step 0 of section f has played
    hint: say the cue later, or shorten the animation (:durations:)
```

Other cues act on the scene block without moving the step: ``{cue to=merge}`spot` `` (spotlight), `point`, `ink`, ``{cue}`pause 800ms` `` (silence in the middle of a sentence; the sentence is split there), ``{cue}`mark <name>` `` (a chapter point). Without `to`, a cue acts on the nearest block above the paragraph. The full list is in `presmium-author/references/directives.md`, "Lecture roles `presmium.lecture`".

## Several blocks in one section

Steps are counted per section. A block that spans several steps and has no `:reveal:` starts at the last step used so far, so a second scene **shares** its first step with the last step of the scene above it:

| Source | Block steps |
|---|---|
| scene `g1` (2 durations), 2 paragraphs, scene `g2` (2 durations), 2 paragraphs | `g1` at 0–1, `g2` at 1–2: the paragraph "g2 step 0" is said on step 1 together with g1's last step |
| same, with `:reveal:` on `g2` | `g1` at 0–1, `g2` at 2–3: one paragraph per step |

Gallery section: `two-scenes`.

Write `:reveal:` on a second scene (or any later multi-step block) that should start after the first one finished. Other multi-step blocks (`{code-ref}` with `:steps:`, `:reveal: items` lists, components with `:span:`) follow the same rule: without `:reveal:` a block that spans several steps starts at the last step used so far in the section; with `:reveal:` it starts at the next step.

To make the scene and other blocks react to the same sentence, keep them single-step and aim cues at them from the scene's narration. The last section of `gallery/timeline/lecture.md` (`with-code`) puts a code block and a bubble-sort scene in one section; the scene's paragraphs spotlight the comparing and the swapping line with ``{cue to=sort-code lines=3}`spot` `` and ``{cue to=sort-code lines=4}`spot` ``. A component in the section can be clicked the same way, ``{cue to=<label>}`click <action>` ``, for the actions its author declared (see the presmium-develop skill).

## Checking it

1. `presmium check <dir>` reports scene and duration errors at the directive's line: `{scene}: the deck has no scenes/<name>.ts (nor .js, .mjs)` when the scene file is missing ("deck" here means the document), ``:durations: takes durations as {cue}`pause` does (1.2, 1.2s or 800ms), not …`` for an entry it cannot read. Without `:durations:` a scene is one step of length 0.
2. `presmium dev <dir> --to web` (`<dir>` is the document folder) prints the web page's address. Add `?view=present&section=<id>&step=<k>` to it (`<id>` is the section's label) to open the present view at a step; step forward and back. In the document view drag the scene's scrubber through every step.
3. With a synthesized lecture, `presmium build <dir> --to web,lecture` and read the warnings; open the built page with `?view=present&track=script` and listen through the section. `dist/lecture/script/track.json` lists every `go` (step change), `pause` (`hold: true` is waiting for an animation) and utterance with its time, which is the quickest way to see where the dead air is.
