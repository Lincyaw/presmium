---
'create-presmium': patch
'@lincyaw/dsh': patch
---

The presmium-animate skill's flow-matching example is now drawn in three dimensions with Three.js: time is the third axis, the noise and target planes face each other along it, and each particle's path is a curve between them. The camera moves between the states, the velocity field fills the volume on five time slices, the Euler steps are seen from above the path with space magnified, and the one-step comparison is two views side by side. `references/libraries.md` adds how to put text over a WebGL scene, render two views side by side and magnify a small subject.
