---
"@lincyaw/compiler": patch
"@lincyaw/kernel": patch
"@lincyaw/web": patch
"@lincyaw/render-slides": patch
"@lincyaw/workspace": patch
---

Refresh Node services with each compilation's configuration and language, pass resolved Vite plugin entries to document and workspace renderers while keeping live saves consistent when contributors are removed, invalidate recordings with missing blobs, and consistently select and diagnose duplicate plugin components. Resolve dev output directories to their physical paths so renderer dependencies also load through symlinked output locations.
