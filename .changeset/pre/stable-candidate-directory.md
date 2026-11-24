---
"@lincyaw/dsh": patch
"@lincyaw/kernel": patch
"@lincyaw/workspace": patch
---

Keep the macOS assistant in one stable candidate directory across tool calls and reviews, avoiding repeated working-directory notices. Preserve native rollback, candidate-only file permissions, source conflict checks and guarded publication; serialize candidate access across native execution and host review, and include network_bash in the publication transaction.
