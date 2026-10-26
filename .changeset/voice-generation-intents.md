---
"@lincyaw/kernel": minor
"@lincyaw/addon-lecture": patch
"@lincyaw/workbench": patch
---

Allocate voice generation intents before sending requests, so cancellation can precede admission or arrive before the job response is delivered. Keep cancellation idempotent, reject reuse with different source or scope, and isolate adjacent intents. The workspace client cancels undelivered requests without needing a job ID, while completed exact cache entries remain intact.
