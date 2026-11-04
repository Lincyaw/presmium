---
"@lincyaw/host": patch
"@lincyaw/addon-lecture": patch
"@lincyaw/addon-motion": patch
"@lincyaw/skills": patch
---

Scene states follow the voice: while a narrated lecture plays (the presentation's lecture, the Video Production preview, the video export), each state of an animation scene lasts until the voice of the first step that shows it ends, never less than its authored duration, so beats placed as fractions of a state land with their words and `durations` no longer need rewriting after a voiceover. Steps whose narration starts after the animation, recorded lectures, the reading page, slides stepped by hand and captures keep the authored durations. Step clock drivers can give step lengths (`StepClockDriver.stepLength`, read with `useDrivenStepLength`).
