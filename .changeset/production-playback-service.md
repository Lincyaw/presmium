---
"@lincyaw/kernel": minor
"@lincyaw/host": minor
"@lincyaw/addon-lecture": minor
"@lincyaw/web": minor
---

Expose source and plan-bound controls and observable positions from the existing lecture player through the public host service and preview bridge. Pause before seeking, wait for real picture preparation before acknowledging, preserve the clock on repeated loads of the same plan, and reject superseded requests without starting playback. Confirmed silent plans use the existing clock; estimated plans remain unavailable for playback.
