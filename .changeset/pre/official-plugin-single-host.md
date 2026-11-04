---
"@lincyaw/compiler": patch
---

Use Presmium's own copy of an official plugin whenever the project has a separate installation, even when both copies have the same version. This prevents duplicate `@lincyaw/host` instances that make `PmScene` fail with `no host installed`.
