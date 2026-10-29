---
"@lincyaw/addon-speech": minor
"@lincyaw/kernel": minor
"@lincyaw/workbench": minor
"@lincyaw/dsh": patch
---

Volcengine speech synthesis 2.0 (`seed-tts-2.0`) with all of its voices, and cloned voices trained from the workbench.

- The Volcengine engine bundles the full 2.0 voice list. With the account's IAM access key pair (`PRESMIUM_SPEECH_VOLCENGINE_ACCESS_KEY_ID`, `PRESMIUM_SPEECH_VOLCENGINE_SECRET_ACCESS_KEY`, optional `PRESMIUM_SPEECH_VOLCENGINE_PROJECT`) the list and the account's cloned voices come from the account through Volcengine's official SDK; the keys are passed to it explicitly and reach no other address.
- Cloned voices synthesize on 2.0 (`seed-icl-2.0`), and a busy account answers 429 rather than a failure.
- `SpeechService.cloneVoice` and `cloneStatus`, the owner routes `clone` and `clone/status`, and `presmium-speech clone`: the speaker's consent, with the recording of the statement, is registered in the operator directory before the sample is sent. Cloned voices still need `settings.presmium.speech.cloned: true`.
- The workbench's voice dialog has **Clone a voice…**: record or choose the consent statement and a sample (converted to WAV in the browser), confirm the cost, follow the training, and use the voice.
