---
"@lincyaw/addon-publish": patch
"create-presmium": patch
"@lincyaw/presmium": patch
---

`presmium-export` and `presmium-diff` find the slides renderer through the project's `@lincyaw/presmium`, as `presmium` does, so they export in a project that installs only Presmium and the publish plugin (they failed with "no plugin of the document exports pdf"). New projects install Presmium's own packages as soon as they are released, without pnpm's one-day `minimumReleaseAge` delay, and so does the Claude Code plugin.
