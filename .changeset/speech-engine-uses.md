---
"@lincyaw/addon-speech": minor
"@lincyaw/addon-lecture": patch
---

An operator can define an engine that only synthesizes or only transcribes: `PRESMIUM_SPEECH_<ID>_MODEL=none` or `PRESMIUM_SPEECH_<ID>_TRANSCRIBE_MODEL=none`. The engine list reports it (`tts`, `stt`), synthesis and transcription without a named engine go to an engine that does them, and naming an engine for what it does not do is an error that names the variable. When a document's transcription engine is missing or cannot transcribe, the lecture says which setting names it. The lecture's confirmations no longer say a service charges for the work when the engine runs on this machine.
