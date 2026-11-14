# Planning and acceptance for explanatory animation

Read this before implementing or accepting a complete teaching explainer or paper video. It adds the object design and dynamic review that a rest-frame storyboard cannot supply. A logo sting, a deliberately static title card or a single emphasis effect does not need a worked mechanism; its surrounding explanation does.

## 1. Extract the reference before adapting it

When a person specifies an earlier work, inspect its actual scene code and timed output before deciding the new piece's look. A still or a cover cannot establish its motion style. Record in `storyboard.md`:

| Reference passage | Object and meaning | What the operation demonstrates | Space, reading order and camera | What survives into the next beat | Rule to adapt |
|---|---|---|---|---|---|

Describe operations such as a sample being selected, the same point moving to a new encoding, a constraint changing a path, or a result being measured against a fixed baseline. Record entrances, exits and pauses as part of that explanation. Palette, typography and branding are a separate part of the comparison.

Adapt the rules to the new subject. Do not copy a sequence that no longer explains its evidence, add arbitrary motion to match a cut count, or treat one series' reference as the only acceptable style for all animation. If the timed output is unavailable, state that limitation and use the source timeline as partial evidence rather than claiming the visual match was verified.

## 2. Plan the elements and their operations

Before scene code, save the step sequence and both linked tables below in `storyboard.md`. Resolve them for every core explanation, including figures, labels, counters, connections, highlights and camera regions that affect understanding. Group repeated objects when they share the same rule; identify the objects whose individual identity matters. This is a design record: teaching text, parameters and step bindings still belong in `lecture.json`.

**Element design** establishes what a viewer is following:

| Stable object ID | Meaning and visual form | Colour role and spatial convention | Initial state | Data or illustrative basis |
|---|---|---|---|---|

**Operation design** establishes how each explanation happens:

| Step / semantic beat | Object IDs | Operation, path or morph and its meaning | End state | Narration phrase, cue or state-time fraction | When the result appears | Objects carried into the next beat |
|---|---|---|---|---|---|---|

- Give objects stable semantic identities, such as `training-tray`, `candidate-trajectory-2` or `reference-line`. Use scoped selectors in the implementation; these planning IDs do not require SVG `id` attributes.
- Specify the operation, not merely “animate”: which candidates remain after a filter, where one token travels, which coordinates or shape change, what a brace measures, or which source region a camera frames. Give the end value or geometry and its evidence.
- Identify the phrase or cue that causes the operation. Without word alignment, author a fraction of that state's duration and verify it against actual narration; see `timeline.md`. Do not apply the same fractions to every scene regardless of its words.
- State the result's reveal condition: after the last selected item lands, after the measurement reaches the baseline, or alongside the newly framed evidence. Readouts must agree with the state being shown. An observed experimental score can be revealed after its configuration is established; do not pretend to compute it from an illustrative token count.
- State what persists across the boundary and where it is at the end and start. When a cut is intentional, explain what the viewer must retain. Replacing the picture with another complete diagram does not establish object continuity.
- Use a short “held” entry for intentionally static branding, source text or reading time. A table of final-frame keywords with unspecified actions is incomplete and must be resolved before implementation.

Before polishing, make a rough timed preview of the core operations. The strip of resting frames checks structure; the moving draft checks whether the chosen objects can actually explain the claim.

## 3. Show the operation, not only the final answer

Each core explanation has a visible **setup → operation → result → hold**. A meaningful operation can contain several semantic beats: first isolate the candidates, then filter them, then carry the survivors into a count. Choose the number and pace from what the viewer must understand; do not require an identical number of beats, constant movement or one animation preset per paragraph. A deliberate reading hold is useful once the relevant operation and result have been shown.

Use a concrete case before aggregating. Keep its important objects through the changes, then show how the same rule applies to a set or a chart. Explain how a representation changes: if a token becomes a chart point, retain its colour and identity through the move. A new representation should not require the narration to rebuild the relationship from scratch.

For a paper figure, guide the eye through **axes and encoding → current object → comparator → conclusion**. Frame or highlight the region currently being discussed, keep the necessary baseline visible, and move the focus when the explanation moves. The original figure remains evidence; overlays and camera work must preserve its values, axes and uncertainty. If reconstructing a data view, use sourced values and make the correspondence to the original explicit. A camera zoom without a reading purpose is decoration.

| Fails as the core explanation | Corresponding explanatory treatment |
|---|---|
| Static cards say “one trajectory”, “more trajectories” and “better score”; the voice supplies the entire process | Follow candidates from one question into a training tray, visibly select the relevant set, update its sourced aggregate, then locate that configuration's score against the fixed reference |
| A whole paper figure and all conclusions are visible from the first frame while the voice reads them | Establish the axes, isolate the first relevant column, carry the highlight to the next column, measure their relationship to the reference, then reveal the conclusion and hold |
| Every page draws a line, fades in a group and pops up all numbers at the same fractions | Design each operation from its meaning: filter candidates, move a value to a new scale, extend a curve from observations, or change a constraint and show the resulting path |
| A dot grid fills randomly while a counter changes, with no explanation of what a dot means | Introduce one item and its mapping, apply the same rule to the set, then add only the newly covered items and update the matching count; mark an illustrative mapping as such |
| A new complete diagram replaces the previous one at each step | Retain the relevant objects and their positions, transform or move them into the next configuration, and change only what the new comparison controls |
| The logo, colours and title card match the reference, but the explanation is still a slide deck | Adapt the reference's way of operating on objects, staging comparisons and carrying identity across shots, as recorded in the reference table |

Entrance effects can support these operations. They cannot substitute for them. More animation, more steps or a longer timeline is not evidence of better explanation.

## 4. Review four different things

Report these results separately in the storyboard and delivery evidence. A pass in the first three does not imply a pass in the fourth. Mark missing observations as unverified rather than turning compilation or a contact sheet into an overall approval.

| Review | Evidence and question |
|---|---|
| Facts | Are the values, units, baselines, uncertainty and conditions supported? Are illustrative objects distinguished from measured data? |
| Layout | Are essential objects and labels legible at the delivery size, with captions enabled, without overlap or accidental cropping? |
| Runtime | Does the saved version compile and play with the intended audio and timing? Do direct, backward and arbitrary seeks reconstruct the same states without callback history or missing objects? |
| Explanatory motion | Does the viewer see the planned operation happen, follow the same objects through it, and understand how the visible result follows? Does the motion and spatial continuity match the chosen reference rules? |

For explanatory motion:

1. Review each core explanation's full timed preview at the intended pace, including the setup, operation, result and hold. Check its complete time range rather than only an entrance and a middle frame. If continuous playback cannot be observed, report that limitation; timed frame samples and source inspection provide partial evidence, not proof that playback was watched.
2. Sample the start, the before/during/after states of each planned operation and the settled result using native `capture_slides` with `at`. Choose times from the beat plan, not the same fractions for every shot. Compare against actual narration; a correct final picture does not repair a premature answer or an unexplained transformation.
3. Inspect both sides of every core boundary. Check that carried objects are recognizable in position, scale, colour and meaning; identify intentional cuts. Inspect the exported video around those boundaries as well as the preview.
4. Select steps directly and in a different order, seek into their operations and return backward. Compare the same timestamps. Stable outcomes and intermediate states must come from step and time alone.
5. Give an independent cold viewer the timed material and narration, without the source or explanatory notes. Ask: “Which object was being followed? What was done to it? What changed as a result? What comparison or rule supports that result?” Have them retell the chain and predict an appropriate next change. A viewer who repeats the captions or calls it “clear” has not demonstrated this understanding.

A contact sheet is useful for facts, layout and the broad story. The still-frame cold read in `team.md` remains an early check; supplement it with the dynamic review above before accepting a complete explanatory animation. Record specific unresolved moments by timestamp and object, the intended operation and the required change. Fix a missing mechanism at the storyboard stage, not by adding effects to its finished card.
