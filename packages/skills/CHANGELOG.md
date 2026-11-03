# @lincyaw/skills

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
