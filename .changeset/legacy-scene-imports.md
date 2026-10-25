---
'@lincyaw/web': patch
---

Resolve legacy `@lincyaw/slidev-addon-*` imports in document code to the renamed plugins' shared public exports. Existing lectures and scenes continue to load in previews and built sites when only the new packages are installed, without bundling duplicate plugin runtimes.
