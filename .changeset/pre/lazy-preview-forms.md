---
'@lincyaw/compiler': patch
'@lincyaw/workspace': patch
'@lincyaw/workbench': patch
'@lincyaw/dsh': patch
---

Open the document preview without waiting for Slidev. Start slides when their view is selected, keep the document view reachable during startup or failure, and ignore preview answers from older document or view requests.

Resolve the preview output directory to its real path before generating renderer paths, so macOS temporary-directory aliases do not break slides addon resolution.
