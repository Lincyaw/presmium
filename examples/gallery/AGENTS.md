# Presmium Gallery

This workspace contains 29 main documents: two complete courses, five feature collections, two tutorials, a Fourier lesson, a product film and 18 animation references. Every lecture.json is its document’s editable authority.

- `learn/` is the Fourier lesson, with its English translation.
- `promo/` is the product film; read its storyboard before editing its scenes.
- `showcase-*/` are the feature collections (one feature per page) and `tutorial-*/` the hands-on tutorials, indexed in FEATURES.md and features.json.
- `animation-library/` comes from the presmium-animate skill gallery. In the source checkout it is a symlink; the editable workspace copy contains regular files. Keep shared scene imports intact.

The two original complete courses are:

- `bubble-sort/` (冒泡排序): one pass of bubble sort, from the code to an animation, a counter the narration clicks and a guided cursor, ending in a narrated lecture.
- `libraries/` (代码写成的动画): one section for each animation library a scene can be written with: GSAP, Anime.js, Motion, Three.js and Remotion, then the narration's clicks and the lecture video.

In each lecture's directory:

- `lecture.json` is the document. Its ordered sections, content blocks, steps, narration and production settings are the editable authority. Narration cues explicitly click, point or pause at their authored positions.
- `scenes/<name>.ts` implements an animation definition referenced from `lecture.json`. Its declared states map to stable document steps; scene-internal animation durations stay with the definition, while narration start, holds, pauses and voice source belong only in `production`.
- `components/*.tsx` are the lecture's own components, such as the counter whose named action the narration clicks.
- `.presmium/speech/` and `.presmium/speech.lock.json` are the synthesis cache of the narration (voice `edge`, Microsoft Edge's read-aloud voice through a local bridge). A sentence that is not in the cache needs a speech engine to be said: without one, the check reports it, and the rest of the lecture still plays. Keep the cache with the lecture.
