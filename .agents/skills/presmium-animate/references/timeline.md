# Steps, narration and playback time

The teaching document has stable sections, steps and narration entities. `sectionOrder` and each section's `stepOrder` define the default presentation order. A step's visuals identify complete component/content states; `narrationIds` define its spoken material. Optional inherited states are resolved at compilation so any step can be selected directly.

Put narration text, pronunciation substitutions and cue nodes in `narrations`. Cue targets identify stable blocks and optional public component elements; parameters are structured. Subtitle text, spoken text and alignments derive from the same content. Do not maintain an independent Markdown script mirror.

`production.defaults`, section overrides and step overrides decide whether narration starts with or after the animation, minimum holds, trailing pauses and voice source. Cue delay belongs to `production.cueTimings`. Recording or media clips reference an asset, source range and step attachment. Runtime playback start times and durations are derived.

**Scene states follow the voice.** A scene definition's `durations` give each state's length on the reading page, on slides stepped by hand, in `capture_slides` frames, and as the step's minimum hold in the plan. While the narrated script plays (the presentation's lecture, the Video Production preview, the video export), state k lasts until the voice of the first step that shows it ends, never less than `durations[k]`; the pause and hold after the voice rest on the state's final frame. A step whose narration starts after the animation (`after-animation`), a step without voice and a recorded lecture keep the authored durations. The scene receives the durations it plays with as `durations`, `at(k)` and `total`.

So place every beat inside a state at a fraction of that state, `at(k) + f * durations[k]` (GSAP seconds: divide by 1000), with f where its key word falls in the sentence; keep fixed-length moves (an entrance, a draw) anchored to such a beat. Never place a beat at a fixed time or retype a state's length: the beat then lands with its words whatever the voice's length, and `durations` need no rewriting after a voiceover. Set `durations` to the pace the state should have without a voice. `capture_slides` with `at` draws the authored timeline; check the voiced timing in the exported video's frames.

A step without narration is valid. Playback must preserve any authored minimum hold and animation state. A cue that advances a step or triggers a component action must be revalidated against the current definition; stale targets must be diagnosed, not silently rebound by index.

Inspect `gallery/timeline/lecture.json` and its `scenes/` code for actual retained animation cases. Verify forward, backward and arbitrary jumps and stop any audition before formal playback. Synthesis is an explicit action using an actual provider; a preview must not silently generate paid audio.
