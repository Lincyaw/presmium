# @lincyaw/skills

## 1.0.0-rc.77

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.77

## 1.0.0-rc.76

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.76

## 1.0.0-rc.75

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.75

## 1.0.0-rc.74

### Patch Changes

- 1caefe5: Publish lossless fast-start alternatives for Opus voiceover clips so supported browsers can play before the full download. Prepare the requested page directly, preload its pictures earlier, and start look-ahead loading only after the current audio and picture are ready.
- @lincyaw/kernel@1.0.0-rc.74

## 1.0.0-rc.73

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.73

## 1.0.0-rc.72

### Patch Changes

- 33b8224: Encode static scene images referenced through new URL(..., import.meta.url) with the shared WebP pipeline, reducing the images needed before narrated playback can start. Track these source images so edits invalidate cached scene bundles.
- @lincyaw/kernel@1.0.0-rc.72

## 1.0.0-rc.71

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.71

## 1.0.0-rc.70

### Patch Changes

- 3b97947: Prioritize the current narrated page and audio before look-ahead loading, stream server audio through native media URLs, and combine GSAP plugin loading to reduce cold-start requests. Keep capture and export waiting for every picture.
- @lincyaw/kernel@1.0.0-rc.70

## 1.0.0-rc.69

### Patch Changes

- 76e748d: 为论文视频约定标题、正文文案、封面与成片的完整交付，补齐 Hinted Scaling Laws 发布素材，并将该片字幕缩小至默认字号的 90%。
- @lincyaw/kernel@1.0.0-rc.69

## 1.0.0-rc.68

### Patch Changes

- 87b9308: Keep collaborative authoring on the latest saved lecture.json. Use one coordinator when author services are unavailable, and keep checks and publishing from reconstructing documents from separate page content.
- @lincyaw/kernel@1.0.0-rc.68

## 1.0.0-rc.67

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.67

## 1.0.0-rc.66

### Patch Changes

- dfa93ac: Let an existing stdio MCP connection discover a later-started Studio and follow same-address restarts. Preserve cancellations and readonly subscriptions across connection changes, and report unknown outcomes without replaying edits or paid operations.
- @lincyaw/kernel@1.0.0-rc.66

## 1.0.0-rc.65

### Patch Changes

- ea85126: Page voice catalogues and retained jobs, keep generation and polling receipts compact, and preserve complete job fields through bounded cursor-based JSON reads without model verification parameters.
- @lincyaw/kernel@1.0.0-rc.65

## 1.0.0-rc.64

### Patch Changes

- 30b7d70: Read voiceover status in bounded pages with automatic source and preview revision binding, preserving native Web state and complete job detail reads.
- @lincyaw/kernel@1.0.0-rc.64

## 1.0.0-rc.63

### Patch Changes

- 06e3914: Pin voice-clone audio before Studio spending approval, reject changed or expired preparation without retraining, and release prepared inputs after rejection or cancellation without adding model tools or arguments.
- Updated dependencies [06e3914]
  - @lincyaw/kernel@1.0.0-rc.63

## 1.0.0-rc.62

### Patch Changes

- 1cfad6a: Accept temporary audio uploads directly as voice-clone samples and recorded consent, without importing canonical assets. Reuse the existing clone owner, 10 MiB limit, frozen input bytes, source checks and spending approval; preserve workspace file paths and canonical import review.
- Updated dependencies [1cfad6a]
  - @lincyaw/kernel@1.0.0-rc.62

## 1.0.0-rc.61

### Patch Changes

- 0b81469: Return bounded live pages of transcription task summaries instead of an entire task history. Continue by stable task or issue identity without extra verification parameters; full task details and the native Web list remain available through their existing queries.
- @lincyaw/kernel@1.0.0-rc.61

## 1.0.0-rc.60

### Patch Changes

- 9b9746b: Allow MCP clients to upload local images and audio outside model context, then import them through the existing approved media transaction. Support file selection, SDK uploads and authenticated proxy prefixes with bounded, expiring, write-once references.
- Updated dependencies [9b9746b]
  - @lincyaw/kernel@1.0.0-rc.60

## 1.0.0-rc.59

### Patch Changes

- 65e60d6: 限制 MCP 转写结果的默认返回量，支持按字段选择和不可变候选的精确 Unicode 分片续读，避免长转写一次占满模型上下文；小结果保持兼容，不增加工具或验证参数。
- @lincyaw/kernel@1.0.0-rc.59

## 1.0.0-rc.58

### Patch Changes

- 1e724c7: 通过现有 MCP 制作草稿操作读取与丢弃手工转写校对，沿用原生草稿存储和转写采用流程；保护组词、存储失败、跨窗口新输入与延迟保存结果。
- Updated dependencies [1e724c7]
  - @lincyaw/kernel@1.0.0-rc.58

## 1.0.0-rc.57

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.57

## 1.0.0-rc.56

### Patch Changes

- b29fd08: 支持通过现有 MCP 讲稿编辑工具准确删除整块讲稿，并在原子事务中调整步骤的完整讲稿顺序。上下文提供限量且对齐的稳定讲稿 ID，保留共享内容与并发编辑保护，同时继续缩减默认工具说明。
- Updated dependencies [b29fd08]
  - @lincyaw/kernel@1.0.0-rc.56

## 1.0.0-rc.55

### Patch Changes

- a0a0e0b: Inspect, read and explicitly discard native pending voice choices and individual media clip proposals through the existing editor action. Keep sibling inputs, synchronize open forms after confirmed local retirement and retain input when storage, source or composition guards refuse the operation. Make existing approvals reachable inside modal and nested dialogs without weakening their focus boundary.
- Updated dependencies [a0a0e0b]
  - @lincyaw/kernel@1.0.0-rc.55

## 1.0.0-rc.54

### Patch Changes

- 0b1348a: Restore new text and place-comment drafts and discard active comment inputs through the existing editor action. Ordinary restore selects the native target internally, returns compact feedback and preserves prior branches. Prefer direct common tools in operation search. Hide transport-owned source and connection fields from ordinary editor discovery. Keep asynchronous browser status receipts as compact as immediate completion, with full details available explicitly. Keep comment forms open while answering approvals, retain newer input across cancellation and storage failures, and allow explicit local draft reads when saved JSON is invalid.
- Updated dependencies [0b1348a]
  - @lincyaw/kernel@1.0.0-rc.54

## 1.0.0-rc.53

### Patch Changes

- f992607: Inspect, read and explicitly discard native step timing, caption timing and recording range drafts through the existing compact editor action. Discovery omits input values; discard synchronizes open fields without saving the document, and retains proposals when storage, source or input guards fail.
- Updated dependencies [f992607]
  - @lincyaw/kernel@1.0.0-rc.53

## 1.0.0-rc.52

### Patch Changes

- fd8a1ea: Import audio and images with a path and adopt recordings with step and asset IDs. Keep source and file verification inside the host, fixed before both MCP and Harness approval, with compact default receipts and compatible advanced requests. Generate alternative input requirements from the original schemas.
- @lincyaw/kernel@1.0.0-rc.52

## 1.0.0-rc.51

### Patch Changes

- 0f6dfc8: Control Studio home and document navigation through the existing editor action, with compact request handles and window observations. Preserve native body saves and recording range drafts across navigation; reject interrupted, stale or unauthorized requests without replay.
- Updated dependencies [0f6dfc8]
  - @lincyaw/kernel@1.0.0-rc.51

## 1.0.0-rc.50

### Patch Changes

- a2022e7: Discover one action's arguments from its existing schema with operations(name, variant), including nested parameters. Keep original execution validation and reject ambiguous or unsafe schema projections.
- @lincyaw/kernel@1.0.0-rc.50

## 1.0.0-rc.49

### Patch Changes

- 69077db: Recover native body drafts through the existing compact editor action: bounded metadata and explicit fragment reads, preserved recovery branches, confirmed discard, and source-pinned retry with cancellation and conflict guards.
- Updated dependencies [69077db]
  - @lincyaw/kernel@1.0.0-rc.49

## 1.0.0-rc.48

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.48

## 1.0.0-rc.47

### Patch Changes

- 93de973: Expose the workspace Changes panel through bounded MCP operations with minimal commit/discard arguments. Share the Web transaction, freeze approved commit content before confirmation, preserve unrelated staging and restore both selected files and index on discard. Reject stale state, unsafe file substitutions and invalid documents.
- Updated dependencies [93de973]
  - @lincyaw/kernel@1.0.0-rc.47

## 1.0.0-rc.46

### Patch Changes

- 910362b: Expose bounded current-file discovery and raw text reads through MCP, with owner-authorized text transactions and invalid-document repair. Keep file versions, approval checks and source readback on the server, preserve native scope/review rules, bound error responses, and expose usable document templates through existing project capabilities.
- Updated dependencies [910362b]
  - @lincyaw/kernel@1.0.0-rc.46

## 1.0.0-rc.45

### Patch Changes

- 54141d9: Expose bounded workspace review summaries, file diffs and accept/reject/checkpoint actions to external owner MCP clients. Bind approval to the exact candidate tree, publish immutable reviewed bytes and recheck after waiting for editor flush and workspace locks. Keep document assistants from approving their own changes.
- Updated dependencies [54141d9]
  - @lincyaw/kernel@1.0.0-rc.45

## 1.0.0-rc.44

### Patch Changes

- f0a5f16: Reuse native Studio view, editor history and recording controls through the compact MCP action interface, with exact pending-request cancellation and required-review enforcement. Share production enablement and owner-authorized voice training with canonical document and speech services.
- Updated dependencies [f0a5f16]
  - @lincyaw/kernel@1.0.0-rc.44

## 1.0.0-rc.43

### Patch Changes

- e8932fb: Expose speech configuration status and credential changes through MCP using the same settings instance and canonical parameter schema as Web. Restrict operator settings to workspace owner credentials, retain write approval and revision checks, and keep secret values write-only.
- Updated dependencies [e8932fb]
  - @lincyaw/kernel@1.0.0-rc.43

## 1.0.0-rc.42

### Patch Changes

- b93f5f3: Return compact skill summaries by default instead of every bundled resource path. Keep complete file lists and versions available on demand, filter discovery by skill name, and minify skill resource responses.
  
  Read the current saved source internally when starting a workspace build without an explicit source. Preserve optional stale-intent protection, target/input checks, approval and existing-job reuse.
  
  Return concise build status and output links through the compact MCP catalog; retrieve complete source, file and log details by job ID.
  
  Preserve known server failure codes and localized guidance; keep browser launch diagnostics in service logs instead of large MCP error replies.
- @lincyaw/kernel@1.0.0-rc.42

## 1.0.0-rc.41

### Patch Changes

- 5940bf2: Reduce the default external MCP catalog to common editing tools and permission-specific operation dispatchers. Generate argument discovery from canonical schemas, omit unreachable definitions, and return concise save receipts with opt-in details. Add current editor context, exact narration editing, single-call semantic actions and browser action acknowledgements while preserving authorization and DeepSeek Harness candidate review routing.
- Updated dependencies [5940bf2]
  - @lincyaw/kernel@1.0.0-rc.41

## 1.0.0-rc.40

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.40

## 1.0.0-rc.39

### Patch Changes

- ddae828: Simplify canonical editing with one-call page renaming and content changes, saved-source verification and reported editor synchronization. Owner credentials authorize document editing without another Studio prompt; execution and paid operations retain confirmation. Expose live tool input schemas through CLI introspection without separate parameter documentation.
- @lincyaw/kernel@1.0.0-rc.39

## 1.0.0-rc.38

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.38

## 1.0.0-rc.37

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.37

## 1.0.0-rc.36

### Patch Changes

- e5557f5: Keep Studio HTTP MCP on fixed port 4321 and preserve per-workspace external credentials across restarts and upgrades. Print the MCP address and credential-file location, and report port conflicts instead of silently changing the address.
- @lincyaw/kernel@1.0.0-rc.36

## 1.0.0-rc.35

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.35

## 1.0.0-rc.34

### Patch Changes

- 02a24d7: 统一编译器与查看器的条件导出解析，修复分步执行超时后的重试；移除旧 Markdown 指令与角色适配接口，将动画定义规则归入动画插件，并将工作台的编辑器生命周期与制作动作分离为独立控制器。
- Updated dependencies [02a24d7]
  - @lincyaw/kernel@1.0.0-rc.34

## 1.0.0-rc.33

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.33

## 1.0.0-rc.32

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.32

## 1.0.0-rc.31

### Patch Changes

- Updated dependencies [d2f07d1]
  - @lincyaw/kernel@1.0.0-rc.31

## 1.0.0-rc.30

### Patch Changes

- fecb9ab: Captions have a size for the whole document: `production.captions.scale` (0.7 to 1.6, default 1) multiplies the presentation's caption overlay and the captions burned into an exported lecture video, and Video Production's Captions tab sets it with **Caption size** / “字幕大小” (70% to 160% in steps of 10%). Burned captions are now about 60 px on a 1080p frame at the default size.
- 0447441: Add `presmium voiceover` (report what generating a document's voiceover would do, generate the missing sentences in-process with `--yes`, set the default voice with `--voice`, delete unused speech cache with `--prune`), `presmium speech key set|clear|status` (the Volcengine speech key in the workspace's operator settings) and `presmium script export|import` (the narration as one Markdown file to polish and back).
- dcd90a0: Video Production loads while the author is on a page or step the lecture leaves out: the preview goes to the first step of the lecture after it (the last one before it at the end of the document), and the timeline of such a page says it is not in the lecture. A step that a `{cue}next` of an earlier narration moves into stays in the lecture, so the cues after it no longer land one step late. `presmium script` keeps an edited narration's line breaks and blank lines, and writes a `\`, `{`, `}`, `⟦` or `⟧` that is text (and a `|` inside a pronunciation) with a `\` before it, so that braces written in a narration are no longer read back as a pronunciation. `presmium check` reports, as a warning, when it could not check the lecture video's length against `maximumDurationMs`, and an animation on a step the lecture leaves out no longer makes the whole plan's timing unknown. Captions burned into an exported video scale with the frame, near its bottom edge, in near-black ink on a see-through light gray, and never take more than two lines, as laid out on the frame (an identifier or a URL wraps inside the box and no longer takes a third line): a longer caption is shown in as few pieces of about equal length as fit, one after another, cut after a sentence or a clause where there is one; an ASCII `.`, `,`, `:`, `;`, `!` or `?` ends one only before a space or at the end, so 1,024, 3.14 and 10:30 stay whole and an English sentence ends at its period. A word-timed caption group that would pass 42 characters ends at its last comma or other clause mark instead of between two characters (“…后者要预判模型规模达” | “到多大时…” becomes “…训练方案，” | “后者要预判…”), in the video, its WebVTT captions and the web player alike. `presmium-lecture export --contact-sheet` reads the video once for all its frames, labels them with libass (FFmpeg's `ass` filter) and works with FFmpeg before 5.1; when every step is shorter than 0.6 s it writes no image and says why, where it failed with “Maximum call stack size exceeded” after encoding the video. `presmium mcp` documents `./tools` and `./call` for a document directory with those names.
- 3bd7c86: `presmium-lecture timing <document> [--json]` prints, from the production plan the video export plays, each step's script characters, voiceover seconds, characters a second, animation and length, then the totals and the video's length. The lecture renderer option `metadata.renderers.lecture.maximumDurationMs` makes `presmium check` report a video that is longer, with how far it runs over and about how many characters of script to cut at the measured rate. `presmium-lecture export … --contact-sheet [<file.png>]` also writes one PNG of two labelled frames of every step, taken from the exported video with FFmpeg. A step whose visible blocks are all limited to other forms and that has nothing to say or play is no longer in the lecture video, its plan, captions or chapters.
- baeb4f3: Scene states follow the voice: while a narrated lecture plays (the presentation's lecture, the Video Production preview, the video export), each state of an animation scene lasts until the voice of the first step that shows it ends, never less than its authored duration, so beats placed as fractions of a state land with their words and `durations` no longer need rewriting after a voiceover. Steps whose narration starts after the animation, recorded lectures, the reading page, slides stepped by hand and captures keep the authored durations. Step clock drivers can give step lengths (`StepClockDriver.stepLength`, read with `useDrivenStepLength`).
- 4be7244: The animation skill gains a piece for explaining a paper's own figure (a crop tool with a word map, a camera that frames one region at a time, marks in the figure's coordinates) and the pitfalls met making a narrated paper film; the writing guide gains a checklist for narrated explainers: keywords on screen, narration that describes each frame, and a pass for literal translation into Chinese.
- Updated dependencies [fecb9ab]
- Updated dependencies [0447441]
  - @lincyaw/kernel@1.0.0-rc.30

## 1.0.0-rc.29

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.29

## 1.0.0-rc.28

### Patch Changes

- Updated dependencies [4edc156]
  - @lincyaw/kernel@1.0.0-rc.28

## 1.0.0-rc.27

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.27

## 1.0.0-rc.26

### Patch Changes

- Updated dependencies [2658af1]
  - @lincyaw/kernel@1.0.0-rc.26

## 1.0.0-rc.25

### Patch Changes

- Updated dependencies [6933f96]
  - @lincyaw/kernel@1.0.0-rc.25

## 1.0.0-rc.24

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.24

## 1.0.0-rc.23

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.23

## 1.0.0-rc.22

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.22

## 1.0.0-rc.21

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.21

## 1.0.0-rc.20

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.20

## 1.0.0-rc.19

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.19

## 1.0.0-rc.18

### Patch Changes

- Updated dependencies [54f0896]
  - @lincyaw/kernel@1.0.0-rc.18

## 1.0.0-rc.17

### Patch Changes

- e4a6636: On a web page with several scrolling sections, a scene plays its step's motion again as the reader scrolls to the step, instead of showing the step's last frame: only the section across the reading line moves the reader's place, where every one of them used to, so that the last section on the page held it. The outline follows the section being read. A scene is built again only when the step's state or a parameter it read while building changes, so a scene whose timeline covers every step keeps it from step to step instead of rebuilding (a pause of a whole build at every step); the library helpers pass the context on without reading it. On a reading page a scene is built as it comes within a screen of the window, while the page is idle, instead of every scene at once when the page opens. The site marks a page with scrolling sections with an attribute instead of a `:has()` selector, which made the browser restyle the whole page at every change a scene made while building.
- e4a6636: The built-in website themes take the AegisLab look: a cool light grey page (near-black in dark mode) under a faint ambient wash, a translucent header that lines up with the page's columns and marks the current navigation item, Hanken Grotesk for the interface and sans text, and pill-shaped buttons, search fields and segmented choices (`data-shape="pill"`, a new shape beside the densities). `docs` and `course` now default to the `blue` accent (the AegisLab blue) and `sans` typography, and `presmium new --type site` writes these; a site that names `accent` or `typography` keeps its choice. The home and landing pages are centred as blog and documentation front pages are, with cards of equal widths centred as a group; a JSON homepage without `hero` has no hero and starts at its first section. The author skill gains a guide to writing the homepage and to keeping `site.nav` to site-wide destinations rather than one entry per document; `presmium new --type site` follows it, writing a homepage that lists the documents and no navigation entry. Beside the outline on wide screens, the left column no longer repeats the sections of a document without chapters, and a site of that one document drops the left column. Scrolling sections, a figure beside its steps, spread to the room between the columns (at most 75rem) while prose keeps its measure. A link or an address to a section lands with its title clear of the header (and of the bar under it on a phone), also when the page is drawn after it loads. The workbench keeps its warm reading surface.
- b8e7b32: The writing guide and the guide for pieces made by several agents now ask for a term's definition at its first mention, recorded in the term table with the page where it first appears and the calques not to use (对照组, not 臂, for an experiment's arm). A closing list of what the work cannot show counts as a defensive sentence; the work states what it answers instead. The review reads the argument as a chain, each page's claim against the pages it rests on. Each agent rereads its own words against the storyboard before reporting, and the cold read adds a third pass on definitions, information and the argument.
- @lincyaw/kernel@1.0.0-rc.17

## 1.0.0-rc.16

### Minor Changes

- 3d19daf: AI tools connect to Presmium with one command. `presmium mcp` serves MCP on stdio and relays to the Presmium Studio or `presmium serve` running for the project, reading their port and access token from the state file again whenever they start anew; with neither running it compiles the document itself. A new project has a `.mcp.json` for Claude Code and starts with a first commit, and its README and AGENTS.md say how to connect. On connecting, the server's instructions give the order of work with the tools that host offers.
  
  `capture_slides` takes pictures of a page's steps as the presentation shows them, as PNG images: each step's rest frame, moments into its animation (`at`), and the boxes of elements a CSS selector `measure`s. With `arrive: 'backward'` each step is reached from the step after it, as a presenter going back does. `capture_reading` takes a page of the reading version at a window width, and `capture_overview` every page at once, as a directory of frames in reading order and sheets of labelled thumbnails. The workspace service draws them in a headless browser through the viewer's capture hook, which drives the step clock exclusively (`StepClockDriver.exclusive`), so a picture is the same however often it is taken.
  
  A write that needs the author's approval fails at once with `approval-unavailable` when no Presmium window is open to ask, instead of waiting and reporting a refusal; `presmium serve --allow` allows kinds without asking, as `presmium dev --allow` does. `plan_document_change` and `apply_document_change` no longer return the whole document. A document whose code can't be bundled reports why as a `presmium.preview.code` diagnostic. Servers remove their state file when they stop. A preview in the workbench posts its messages only to the workbench's own origin, without a console warning for each other allowed origin. `presmium skills install --update` replaces skills an earlier Presmium installed.

### Patch Changes

- 3d19daf: A document that names a new plugin while `presmium studio` or `presmium serve` is running presents again without a restart: its code is bundled with the plugin's modules shared by name (a project need not resolve `@lincyaw/addon-motion/scene` itself), also when a build for the earlier plugins was still running. Run from the repository, `presmium new` and the skills (installation, MCP, Studio) read the templates and skills from their sources rather than from copies left by an earlier pack.
- 3d19daf: Diagrams and animations have categorical colours for the things they tell apart (roles, series, categories): `--pm-color-category-1` to `--pm-color-category-8`, each with a `-soft` fill, with light and dark values, in `COLORS` and in scenes as `color('category-1')`. They carry identity, not status. Taken in order, neighbours stay apart for colour-blind readers and so does any pair among the first four; each reads as a line or as text on the page and on a surface. The k-means scene in the animation gallery colours its clusters with them instead of the status colours.
- 3d19daf: The authoring and animation skills take in the review of a 19-page explainer made by several agents in parallel. The writing guide asks for one name per concept (a term table, and a sweep for the synonyms it rules out), formal words of the audience's field in titles, labels, metric names and narration, concepts shown before they are named and used, a method explained before its steps, the whole slide used rather than a band kept for captions, and narration that also reads well in a `scrolly` page's step track. The animation skill has a new reference, `team.md`, for making one piece with several agents: the storyboard every agent works from, shared scene modules with one owner, concurrent edits through the MCP author actions, review rounds and a cold-read prompt. Its library notes add the scene pitfalls met on the way: callbacks and timers under seeking, `cqw` in GSAP's `x` and `y`, `autoRound` in a small viewBox, drawing strokes with `pathLength`, arrowheads without markers, `max-width` on SVGs in an anchor, raw colours, and prefixed classes in shared modules.
- Updated dependencies [a76bea9]
- Updated dependencies [3d19daf]
- Updated dependencies [3d19daf]
  - @lincyaw/kernel@1.0.0-rc.16

## 1.0.0-rc.15

### Patch Changes

- ae8d16d: `presmium-present` is merged into `presmium-author`, which now covers writing, presenting and producing a document. Its writing guide gives each page a reading version (formal written language, in Chinese or English word order, every sentence carrying information) and a presentation version (a claim as heading, keywords, pictures and steps, with a separate spoken script as narration), shows how `only` keeps their words apart, and ends with a review from a fresh reader's seat. The skill lists the MCP author actions in the order an agent uses them; classroom and lecture production move into it, and the two publishing guides are one.
- 74f5eca: The animation gallery's documents follow the writing guide of `presmium-author`: each opens with what the collection is for, each effect says when to use it and what it shows in formal written Chinese, and the narration is a spoken script; the narrated flow-matching explainer has fresh voiceover.
- 0d47b70: The writing guide no longer asks for a picture on every slide: a page whose role is its words (a definition, a rule, short steps, a question, a summary) stays text, and slides vary their arrangement only where a shared one hides a relation in their content.
- @lincyaw/kernel@1.0.0-rc.15

## 1.0.0-rc.14

### Patch Changes

- Updated dependencies [eb70da8]
- Updated dependencies [5c57e92]
  - @lincyaw/kernel@1.0.0-rc.14

## 1.0.0-rc.13

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.13

## 1.0.0-rc.12

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.12

## 1.0.0-rc.11

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.11

## 1.0.0-rc.10

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.10

## 1.0.0-rc.9

### Patch Changes

- Updated dependencies [fcaaa81]
  - @lincyaw/kernel@1.0.0-rc.9

## 1.0.0-rc.8

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.8

## 1.0.0-rc.7

### Patch Changes

- @lincyaw/kernel@1.0.0-rc.7

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

### Minor Changes

- 1d12f47: Share the four authoring, animation, presentation and plugin-development skills across Studio, MCP and VSIX. Add bounded skill discovery and reading without a document, plus a project installer that preserves existing skills.

### Patch Changes

- e6f2ba8: A scene's first frame waits for the page's fonts (before the build, so canvas text uses them) and for every `<img>` it shows to decode, so a video export opens on the picture. A `threeScene` build may be async, to load textures before the first frame. The presmium-animate skill adds `gallery/catalog`: 80 scenes adapted from the HyperFrames catalog (transitions and camera moves, annotation and pointers, product screens, code and data, captions and type, motion, shaders and 3D) whose text, images and data are parameters, indexed in "Find an effect"; scene CSS is scoped to its frame; the story, length and asset references gain a brief with options and approval gates, sound and music, rhythm and self-review.
- 17a25b3: The presmium-animate gallery shows its pieces by scenario: algorithms and code, data and charts, mathematics and machine learning, text and captions, emphasis and annotation, concepts and structure, product demos, transitions and camera, paths and 3D, and motion craft. Scene sources stay in their library and catalog folders and each scenario forwards to them; lengths, films, the storyboard example and the timeline remain documents of their own.
- c403261: Showcase-theme document pages share a product homepage's surface (cool background, translucent header, wordmark), and their page buttons keep their width and scroll sideways on narrow screens. The animation gallery's documents carry category tags and descriptions, and their introductions state each catalog's rules instead of where its entries came from.
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
