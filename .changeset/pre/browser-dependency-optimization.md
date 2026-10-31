---
"@lincyaw/kernel": patch
---

Resolve installed dependencies with browser import conditions, prebundle CommonJS entries, and keep native ES modules in their package scope. This prevents Slidev's dependency exclusions from leaving unresolved package-private imports in generated chunks.

Reuse each installed package's resolved optimization graph across live saves while linking every output root independently.
