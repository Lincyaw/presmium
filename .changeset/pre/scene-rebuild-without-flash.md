---
"@lincyaw/addon-motion": patch
---

Keep a scene's picture on screen while it is rebuilt for another step's state, the theme or a new size. The new scene is made in a hidden layer of the stage and replaces the shown one in one task, so a step change no longer paints the scene's authored DOM (all of a `from()` reveal's later elements, or the reverted start) for a frame or two before the step's animation.
