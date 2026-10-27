---
"@lincyaw/addon-speech": patch
"@lincyaw/kernel": patch
---

Bind newly generated speech cache keys to the engine's non-credential configuration profile, including normalized URL, provider, adapter kind and model. Verify actual audio SHA and profile across lookup, direct cached playback and alignment; bind saved alignment to its audio and transcription profile. Preserve committed legacy audio offline through its speech lock, allow one explicitly locked new profile per request offline, and report ambiguous or mismatched results as cache misses without generating audio. Reject engine URLs containing credentials, a query or a fragment.
