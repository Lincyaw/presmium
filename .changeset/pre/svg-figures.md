---
"@lincyaw/web": minor
"@lincyaw/render-slides": minor
"@lincyaw/addon-publish": minor
"@lincyaw/skills": minor
"@lincyaw/dsh": minor
---

Export step-built SVG figures: `presmium-export --format svg` (and **Export → Figures as SVG** in the studio) writes each `<svg data-figure="name">` a component draws as `<name>-<n>.svg`, one file per step that changes it, with its look written on each element. The new `presmium-figure` skill shows how to draw such a figure as a React component and build it up step by step.
