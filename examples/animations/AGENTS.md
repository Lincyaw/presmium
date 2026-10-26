# Presmium example: teaching with code

Two lectures in Chinese, written for this repository, that show what Presmium does with animations in code.

- `bubble-sort/` (冒泡排序): one pass of bubble sort, from the code to an animation, a counter the narration clicks and a guided cursor, ending in a narrated lecture.
- `libraries/` (代码写成的动画): one section for each animation library a scene can be written with: GSAP, Anime.js, Motion, Three.js and Remotion, then the narration's clicks and the lecture video.

In each lecture's directory:

- `lecture.json` is the document. Its ordered sections, content blocks, steps, narration and production settings are the editable authority. Narration cues explicitly click, point or pause at their authored positions.
- `scenes/<name>.ts` is the animation of `{scene} <name>`, a timeline written with one library. Its `:durations:` cut it into the steps of the section: when the number of narration steps changes, the durations and the scene's parts change with it.
- `components/*.tsx` are the lecture's own components, such as the counter whose named action the narration clicks.
- `.presmium/speech/` and `.presmium/speech.lock.json` are the synthesis cache of the narration (voice `edge`, Microsoft Edge's read-aloud voice through a local bridge). A sentence that is not in the cache needs a speech engine to be said: without one, the check reports it, and the rest of the lecture still plays. Keep the cache with the lecture.
