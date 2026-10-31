---
"@lincyaw/workbench": patch
---

Retire a pending comment-recovery feedback owner when its handle or editable session changes. A cancelled recovery cannot place an old warning into a newly reopened edit, while later input in the original session still receives the recovery-cancelled notice.
