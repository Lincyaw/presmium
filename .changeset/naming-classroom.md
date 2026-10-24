---
'@lincyaw/addon-classroom': patch
'@lincyaw/addon-session': patch
'@lincyaw/addon-publish': patch
'@lincyaw/addon-content': patch
'@lincyaw/addon-code': patch
'@lincyaw/addon-core': patch
'@lincyaw/addon-stage': patch
'@lincyaw/classroom-server': patch
'@lincyaw/host': patch
'@lincyaw/web': patch
---

Name the classroom's and the other plugins' public API after what each name does, and move the demonstration components out of the published plugins. Old name to new name:

- `@lincyaw/addon-classroom`:
  - The classroom store's records name the right options of a quiz `correct` (`QuizState`, `QuizSource` and the `PmQuiz` prop, which was `answer`), the asker of a question `participant` (was `author`) and the component a record belongs to `quizId`, `pulseId`, `predictId`, `exerciseId` (were `quiz`, `pulse`, `predict`, `exercise`). Records that earlier versions wrote are still read. A deck that writes `{component} PmQuiz` with an `answer` prop passes `correct` instead; `{quiz}` is unchanged.
  - `isAnswer`, `isQuizState`, `isPulseVote`, `isSubmission`, `isQuestion`, `isNote`, `isSavedPrediction`, `isPrediction` to `toAnswer`, `toQuizState`, `toPulseVote`, `toSubmission`, `toQuestion`, `toNote`, `toSavedPrediction`, `toPrediction` (they return the record, or `undefined`); `useCollection` takes such a function.
  - `useSession`, `useNotes`, `useWrite`, `bothStores` to `useParticipation`, `useNoteStore`, `useGuardedWrite`, `layeredStore`; `readersHave`, `isLabel`, `sectionNumbers` to `isForStudents`, `isAuthorLabel`, `toSectionNumbers`; `tally`, `distribution`, `summarize`, `summaryText`, `Tally`, `ExerciseSummary` to `quizTally`, `pulseTally`, `exerciseTally`, `exerciseTallyText`, `QuizTally`, `ExerciseTally`; `QuestionGroup.place` to `label`. New: `classroomRows`, `unansweredCount`, `ClassroomRecords`, `ClassroomRows`. No longer exported: `READERS`, `CHECK_PROGRAM`, `typicalError`.
  - The passes are named `presmium.classroom.places`, `presmium.classroom.predict-reveals` and `presmium.classroom.predict-fallbacks`.
- `@lincyaw/addon-session`: `createClassroom`, `Classroom`, `ClassroomOptions` to `createClassroomConnection`, `ClassroomConnection`, `ClassroomConnectionOptions`, and its `serve()` to `setServer()`; `useClassroom` to `useClassroomSession`; `started`, `ended`, `cursorOf`, `plain`, `loopbackLink`, `roomId`, `sessionConfig` to `startRecord`, `endRecord`, `clonePosition`, `jsonClone`, `isLoopbackLink`, `readableString`, `toSessionConfig`. `ClassroomSnapshot.presenterPosition`, which nothing read, is removed.
- `@lincyaw/classroom-server`: `ClassroomServerOptions.host` to `listenAddress`; the command's file is `bin/presmium-classroom-server.mjs` (the command and its `--host` are unchanged).
- `@lincyaw/addon-publish`: `OFFLINE_MANIFEST`, `OfflineManifest` to `OFFLINE_CACHE_RULES`, `OfflineCacheRules`; `onInBuild`, `publishOptions` to `slidevEnablesInBuild`, `toPublishOptions`. New: `MEDIA_EXTENSIONS`. The pass is named `presmium.publish.remote-assets`.
- `@lincyaw/addon-core`: the demonstration components `PmDemoStepper`, `PmDemoGreeting`, `PmDemoAnimated`, `PmDemoBroken`, the demonstration plugins (`demoPlugins`, `DEMO_GREETER`, `DEMO_GREETING`, `Greeter`), `wantsDemo`, the `presmium.core.demo` option and the `presmiumPlugins` export are removed (they live in a test plugin of the repository). `sharedOut`, `sharedReceiver`, `slideSectionOf`, `SlideSections.placeOf` to `sharedStateOut`, `createSharedStateIn`, `toSlideSection`, `SlideSections.slideAt`. The pass is named `presmium.core.slide-sections`.
- `@lincyaw/host`: `pluginsOf(module)` takes no configuration: a plugin module no longer exports `presmiumPlugins(config)`.
- `@lincyaw/addon-content`: `<presmium-demo-counter>`, `defineDemoElements`, `DEMO_COUNTER_TAG`, `contentPlugin` and the `./client` export are removed. The pass is named `presmium.content.plantuml`.
- `@lincyaw/addon-code`: `found`, `notFound`, `locate`, `unitRecord`, `codeConfig` to `resolvedAt`, `unresolved`, `lineRange`, `originUnits`, `toCodeConfig`; `Candidate.print` and `Snippet.units` to `Candidate.fingerprint` and `Snippet.regions`. No longer exported: `dedent`, `isRegionMarker`.
- `@lincyaw/addon-stage`: `STAGE_MESSAGES` to `MESSAGES`, `screenMode` to `toScreenMode`; `./client` no longer re-exports the names of `./domain`. The pass is named `presmium.stage.footnotes`. `StageViewerContext` is removed: the viewer plugin takes `ViewerPluginContext` from `@lincyaw/viewer`, as the guide and session plugins now do too.
