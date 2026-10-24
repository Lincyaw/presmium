---
'@lincyaw/addon-lecture': patch
---

A static page looks for its lectures under itself (`lecture/`) before beside its web form (`../lecture/`), so a site of several documents can publish each one's narrated lecture in the document's own directory: two documents' lectures, both named `script`, no longer meet at the same address. A document's own build and the video export keep `../lecture/`.

The repository's public example is now `examples/animations`, two lectures written for Presmium (bubble sort, and animations in code with GSAP, Anime.js, Motion, Three.js and Remotion) with their narration's synthesis cache; `pnpm studio` prepares a copy of it in `.presmium/example-workspace`. The CS336 course is no longer in the repository.
