---
"@lincyaw/kernel": minor
"@lincyaw/workspace": minor
---

Add shared, source-bound audio transcription task contracts and workspace HTTP adapters. Validate canonical audio bytes before an explicitly confirmed recognition request, retain immutable candidate revisions separately from narration, and persist cancellation intents so delayed requests cannot restart them. Keep known task queries and cancellation accessible when the editable JSON is invalid. Do not adopt scripts, synthesize voiceover, or expose recording controls implicitly.
