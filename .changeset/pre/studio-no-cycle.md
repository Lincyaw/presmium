---
"@lincyaw/studio": patch
---

Studio no longer declares `@lincyaw/presmium` as a peer dependency, which made the two packages depend on each other and Changesets warn of a cycle while ordering the release. `presmium studio` hands Studio its own command; a separately installed `presmium-studio` runs the `presmium` command on PATH, following a pnpm shim to its script.
