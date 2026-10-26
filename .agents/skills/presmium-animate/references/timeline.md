# Steps, narration and playback time

The teaching document has stable sections, steps and narration entities. `sectionOrder` and each section's `stepOrder` define the default presentation order. A step's visuals identify complete component/content states; `narrationIds` define its spoken material. Optional inherited states are resolved at compilation so any step can be selected directly.

Put narration text, pronunciation substitutions and cue nodes in `narrations`. Cue targets identify stable blocks and optional public component elements; parameters are structured. Subtitle text, spoken text and alignments derive from the same content. Do not maintain an independent Markdown script mirror.

`production.defaults`, section overrides and step overrides decide whether narration starts with or after the animation, minimum holds, trailing pauses and voice source. Cue delay belongs to `production.cueTimings`. Recording or media clips reference an asset, source range and step attachment. Runtime playback start times and durations are derived.

A step without narration is valid. Playback must preserve any authored minimum hold and animation state. A cue that advances a step or triggers a component action must be revalidated against the current definition; stale targets must be diagnosed, not silently rebound by index.

Inspect `gallery/timeline/lecture.json` and its `scenes/` code for actual retained animation cases. Verify forward, backward and arbitrary jumps and stop any audition before formal playback. Synthesis is an explicit action using an actual provider; a preview must not silently generate paid audio.
