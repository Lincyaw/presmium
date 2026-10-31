# @lincyaw/classroom-server

## 1.0.0-rc.6

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.6

## 1.0.0-rc.5

### Patch Changes

- Updated dependencies [e1fcfaf]
  - @lincyaw/kernel@1.0.0-rc.5

## 1.0.0-rc.4

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.4

## 1.0.0-rc.3

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.3

## 1.0.0-rc.2

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.2

## 1.0.0-rc.1

### Patch Changes

- 3f4442a: Name the classroom's and the other plugins' public API after what each name does, and move the demonstration components out of the published plugins. Old name to new name:
  
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
- 7ac550a: Name the kernel's, the compiler's and the host's public API after what each name does. Old name to new name:
  
  - `@lincyaw/kernel`: `json`, `problem` and `eventStream` to `jsonResponse`, `problemResponse` and `sseResponse`; `prefixed` to `prefixedLogger`; `Role` to `ParticipantRole`; `RendererExtension` (the extension bound to a render context) to `BoundRendererExtension`; `startPreviewAgent` and `PreviewAgent` to `connectPreviewFrame` and `PreviewFrame`; `previewActive` to `isPreviewActive`; `readPreviewCommand` and `readPreviewReport` to `toPreviewCommand` and `toPreviewReport`. New: `isRenderable`, `environmentExecutor`, `propText`, `ABSOLUTE_URL`, `NON_FILE_URL`, `urlSlug`, `OFFLINE_REQUESTS`, `PreviewProblem`, and, moved from `@lincyaw/viewer`, `FollowAnchor`, `backSection` and `followedPlace`. The workspace service's wire types (`DocumentsAnswer`, `FilesAnswer`, `IrAnswer`, `ReviewSnapshot` and the others, experimental) and `DocumentSummary` are now kernel contracts. `@lincyaw/kernel/contracts` exports only types, service tokens and the preview protocol's parsers; `localeOf`, `deckLocale` and `stepStateAt` are in `@lincyaw/kernel`. No longer exported: `GIT_SAFE_CONFIG`, `HOST_OWNER`, `normalizeWhitespace`.
  - `@lincyaw/kernel/node`: `optimizeDeps` to `linkBrowserDependencies`; `preBundle` is removed. New: `isInside`, `lanAddresses`, `bracketIPv6`.
  - `@lincyaw/compiler`: `buildView` to `buildToDist` (it takes `{ to }`; build into another directory with `build`); `lineOf` to `lineContaining`; `readFrontmatter` to `parseFrontmatter`; `inside` to `isInside` in `@lincyaw/kernel/node`; `Compilation.files`, `dependencies` (`{ files, revisions }`), `runs`, `frontmatter`, `forAudience` and `audienceOf` to `sourceFiles`, `inputs` (`{ files, gitReads }`), `runStats`, `headmatter`, `audienceDocument` and `audienceCompilation`. New types: `DevOptions`, `DevServers`, `GitRead`. No longer exported: `audienceView`, `operatorPlugins`.
  - `@lincyaw/host`: `stopPresmium` to `stopHost`; `useTheme` and `Theme` to `useAppearance` and `Appearance`; `ToolbarPlace`, `useToolbarPlace` and `provideToolbarPlace` to `ToolbarPlacement`, `useToolbarPlacement` and `provideToolbarPlacement`, and `PmToolbar`'s prop `place` to `placement`. No longer exported: `startPresmium`, `stopPresmiumOnPageHide`, `StartOptions`, `createOperations`, `createStatusRegistry`, `createPresenterPanels`, `createToolbar`, `deckChannel`, `positionSlide`.
  - `@lincyaw/server`: `networkAddresses` to the kernel's `lanAddresses`; `HostDocument` to the kernel's `DocumentSummary`; `json` and `problem` are no longer re-exported.
  - `@lincyaw/mcp`: `McpDocument` to the kernel's `DocumentSummary`.
  - `@lincyaw/viewer`: `FollowAnchor`, `backSection`, `followedPlace`, `stepKeys`, `stepTrail`, `trailStep` and `StepKeys` are imported from `@lincyaw/kernel`.
  - `@lincyaw/workbench`: `PreviewView`, `WorkspaceDocument`, `RevertAnswer`, `ReviewView` and `ReviewFollowed` to `PreviewRenderer`, `DocumentSummary`, `RevertResult`, `ReviewSnapshot` and `ReviewUpdate`.
  - `@lincyaw/addon-publish`: `OFFLINE_MESSAGES` to the kernel's `OFFLINE_REQUESTS`.
- Updated dependencies [0e2d705]
- Updated dependencies [6a2db7b]
- Updated dependencies [05448a8]
- Updated dependencies [219bf74]
- Updated dependencies [2744156]
- Updated dependencies [f8606cc]
- Updated dependencies [01b7cee]
- Updated dependencies [01b7cee]
- Updated dependencies [588f751]
- Updated dependencies [2645ab9]
- Updated dependencies [bf8efbd]
- Updated dependencies [39506bf]
- Updated dependencies [9a92214]
- Updated dependencies [b81637f]
- Updated dependencies [ce7b9b3]
- Updated dependencies [12a1172]
- Updated dependencies [ae6b2a0]
- Updated dependencies [bc6c78b]
- Updated dependencies [8b0a084]
- Updated dependencies [05fa463]
- Updated dependencies [3223233]
- Updated dependencies [034204d]
- Updated dependencies [3927612]
- Updated dependencies [01b7cee]
- Updated dependencies [da86b9a]
- Updated dependencies [01b7cee]
- Updated dependencies [18781ba]
- Updated dependencies [4634709]
- Updated dependencies [21b2143]
- Updated dependencies [672d5e5]
- Updated dependencies [e33a62f]
- Updated dependencies [00e8829]
- Updated dependencies [1f329f6]
- Updated dependencies [e924bb7]
- Updated dependencies [d6ac2f8]
- Updated dependencies [0a245df]
- Updated dependencies [15cec09]
- Updated dependencies [28111cb]
- Updated dependencies [7ea1f91]
- Updated dependencies [1f0e84e]
- Updated dependencies [ba18c96]
- Updated dependencies [51de911]
- Updated dependencies [e9022ab]
- Updated dependencies [f85bc88]
- Updated dependencies [8788569]
- Updated dependencies [8e0c72f]
- Updated dependencies [637030d]
- Updated dependencies [70ffb60]
- Updated dependencies [3b284ac]
- Updated dependencies [f459728]
- Updated dependencies [302367d]
- Updated dependencies [3bd1372]
- Updated dependencies [41ba097]
- Updated dependencies [0cb1421]
- Updated dependencies [5a51d3b]
- Updated dependencies [7ac550a]
- Updated dependencies [425055f]
- Updated dependencies [77c1cf0]
- Updated dependencies [831ad4b]
- Updated dependencies [788ef0d]
- Updated dependencies [6803178]
- Updated dependencies [c82e576]
- Updated dependencies [98f5d6c]
- Updated dependencies [2f6efe1]
- Updated dependencies [55f201e]
- Updated dependencies [01b7cee]
- Updated dependencies [9e1fcba]
- Updated dependencies [aca1f46]
- Updated dependencies [e3a1abf]
- Updated dependencies [01b7cee]
- Updated dependencies [db3b832]
- Updated dependencies [4798c02]
- Updated dependencies [4cb9a17]
- Updated dependencies [b4e1194]
- Updated dependencies [8008b64]
- Updated dependencies [1bdd5e1]
- Updated dependencies [e4f26da]
- Updated dependencies [4de2e16]
- Updated dependencies [6d9ae73]
- Updated dependencies [5ca5241]
- Updated dependencies [672d5e5]
- Updated dependencies [5f4e718]
- Updated dependencies [ef0a065]
- Updated dependencies [3cef1d4]
- Updated dependencies [50da8b8]
- Updated dependencies [0ea1271]
- Updated dependencies [34e51cb]
- Updated dependencies [34e51cb]
- Updated dependencies [cd822fa]
- Updated dependencies [2e439f7]
- Updated dependencies [87113ae]
- Updated dependencies [44c1a37]
- Updated dependencies [470fd59]
- Updated dependencies [6e3efc5]
- Updated dependencies [43f2efd]
- Updated dependencies [5f3f4b0]
- Updated dependencies [445390b]
- Updated dependencies [5248460]
- Updated dependencies [afda9e9]
- Updated dependencies [2d81267]
- Updated dependencies [27cdf8c]
- Updated dependencies [672d5e5]
- Updated dependencies [32a4ef8]
- Updated dependencies [f4adb60]
- Updated dependencies [0cb1421]
- Updated dependencies [3bd1372]
- Updated dependencies [3b2d1aa]
- Updated dependencies [0854838]
- Updated dependencies [ae6b2a0]
- Updated dependencies [e5473e5]
- Updated dependencies [6e3efc5]
- Updated dependencies [bc8c616]
- Updated dependencies [6c777cc]
- Updated dependencies [cc2e25e]
- Updated dependencies [d54ddce]
- Updated dependencies [d0e13b5]
- Updated dependencies [02bbab2]
- Updated dependencies [c006f57]
- Updated dependencies [447d24d]
- Updated dependencies [01b7cee]
  - @lincyaw/kernel@1.0.0-rc.1
