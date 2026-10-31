---
'@lincyaw/kernel': patch
'@lincyaw/host': patch
'@lincyaw/addon-lecture': patch
'@lincyaw/addon-speech': patch
'@lincyaw/addon-assistant': patch
'@lincyaw/addon-guide': patch
---

Name the lecture, speech, assistant and guide plugins' public API after what each name does, and keep the synthesis cache's layout behind the speech service. Old name to new name:

- `@lincyaw/kernel`: `Synthesis` has `provider`; `SpeechService` may give `alignWords(key, { lang, transcribe? })` (the words of a cached clip, timed by transcribing it once) and `pruneLock(keep)` (keeps only these keys in `speech.lock.json`); the Node speech service gives both. New: `speechEngineId` (the rule that compares engine ids), `AigcLabel`, `aigcLabel`, `aigcString` and `isCjk`.
- `@lincyaw/host`: new `codeLinesBox`.
- `@lincyaw/addon-speech/domain`: `speak` and `SpokenText` to `applyLexiconWithSpans` and `LexiconText`; `SpeechBody`, `TimedSpeech`, `TranscriptionAnswer`, `EngineListing` and `VoiceListing` to `SynthesisRequestBody`, `SynthesisResponseBody`, `TranscriptionResponseBody`, `EnginesResponseBody` and `VoicesResponseBody`; `speechBody` to `synthesisRequestBody`; `synthesisRequestOf` to `toSynthesisRequest`; `engineId`, `aigcLabel`, `aigcString` and `AigcLabel` to the kernel's `speechEngineId`, `aigcLabel`, `aigcString` and `AigcLabel`. No longer exported: `fakeWords`.
- `@lincyaw/addon-lecture/domain`: `deckTrack` and `recordedSections` to `trimToDeck` and `dropChangedSections`; `chapters` and `Chapter` to `trackChapters` and `TrackChapter`; `readCue` to `parseCue`; `narrationPlace` and `NarrationPlace` to `narrationSource` and `NarrationSource`; `ScriptSections` to `ScriptFileSections`; `PlanProblem.compiled` to `reportedAtCompile`; `PlannedSection.from` `'script'` to `'scriptFile'` (also in the `lecture_preview` tool's answer); `isCjk` to the kernel's `isCjk`. `captionsVtt`, `isStale` and `translationItems` no longer take a digest function (`Digest` is gone; `translationDigest` is the one digest). New: `isWide`, `audioSegments`, `AudioSegment`, `utteranceLine`, `LECTURE_RENDERER`, `PLAYER_RENDERER`.
- `@lincyaw/addon-assistant/domain`: `askSettingsOf` to `toAskSettings`; `askUrlValid` to `isAskUrlValid`; `chunkText` to `streamDelta`, which takes the event's data and returns `{ done: true }` or `{ text? }` (`StreamDelta`). New: `promptLanguage`. No longer exported: `citationsOf`.
- `@lincyaw/addon-guide`: `CUE_MESSAGES` and `CueMessages` to `GUIDE_MESSAGES` and `GuideMessages`; `LIVE_PROBE`, `LiveProbe` and `useIsLive` to `STAGE_PROBE`, `StageProbe` and `useIsOnStage`; the `CueLook` value `'live'` to `'stage'`, and so the `data-look`, `data-pm-spotlight` and `data-pm-hint` attributes of a cue drawn on the stage.

Fixed: the lecture plugin compares engine ids by the speech plugin's rule, so a deck that names its engine in another spelling (for example `My.Fake` for `my_fake`) finds it; before, `presmium check` then synthesized the lecture's paragraphs through the engine. The player's "not yet synthesized" message is gone, as no route answers it.
