# 最终验收缺口清单

本清单由最终验收审计（6 个独立审计代理 + 汇总）在 `main` cc22e81 上生成，共 51 个缺口（12 个主要、39 个次要），按代码归属分为四组，对应工作分解中的 WP-60a 至 WP-60d。每个缺口的修法即其验收标准；修复后对应的集成或端到端测试必须存在并通过。

## 组间约定

I merged six audit reports into 51 gaps: 12 major and 39 minor. Majors come first, then minors in rough order of impact. Gaps that overlapped between reports were combined: K-18 with P-70, N-03 with P-71, P-04 with K-09 and the drawings part of K-13, K-13 with the reproducibility principle, the P-64..67 docs gap with the principles report's ir.md gap, P-13 with P-50, and the {question} name in wbs.md that two reports flagged. I spot-checked the main claims in code and found none to be false. Confirmed: viewer/src/markdown.ts has no handlers for sub, sup, kbd, dl or details, and crossReference renders only its children; code.ts:170 sets the run button's disabled state from the executor at SSR time; addon-exec notebookCell ignores props.recorded and the run-panel fallback holds only code; addon-stage/setup/preparser.ts only matches .presmium/<dir>; nothing calls kernel.dispose; the present view has no overview; addon-publish registers no TOOLBAR item; only the Pyodide executor is registered; the addon-code and addon-stage src/client folders are empty although package.json exports them; .gitignore ignores .presmium/assets; the demo has no anchors.lock.json; package.json has no demo:web but still lists happy-dom and @vue/test-utils; local-env.test uses a fixed test/.tmp/repo; openSearch presses Ctrl+K right after reload. Three items were narrowed instead of kept as code work. The P-25 commit endpoint is already descoped in WBS WP-44, so K-09 code write-back becomes a requirements note and K-09 drawings write-back is fixed through P-04. The architecture 5.6 slide-only marker and the hand-written web service worker become documentation fixes. Framework internals are listed in architecture section 9, and only the cheap DOM-class dependency is replaced.

Ownership is split at package level so the four groups can work in parallel. G1 owns the kernel, compiler, host API, both host adapters (addon-core and web) and the slides renderer, because per-section config, static export, shared state and the plugin lifecycle each need host, kernel and adapter changes together. G2 owns the IR runtime (viewer) and the stage plugin. Web discovers addon-stage/src/client/viewer.ts by itself, so web freeze (P-03) needs no change in web. G3 owns the classroom, session, content, code and guide plugins and the editor tools. G4 owns the exec, publish and notebook packages, the docs, root files, perf and browser test setup, and pnpm-lock.yaml.

Gaps were split across groups only with a stated contract, so each part can be built and tested alone:
(a) Language: G1 makes both forms set <html lang> from the deck language and adds host useLocale. G2, G3 and G4 keep per-package zh-CN/en catalogs that read <html lang>, falling back to navigator.language.
(b) Per-section config: section-level plugin config uses a `{config}` directive whose YAML body is keyed by plugin id and stored as IRSection.config. render-slides writes it to the slide frontmatter `presmium` key. G4 documents this exact syntax.
(c) Static export: G1 swaps a component for its IR `fallback` in print mode. G4 makes addon-exec's fallback include the recorded output.
(d) MyST: G1 fills crossReference text in the IR. G2 renders it and keeps a fallback for empty references.

Each group builds its own fixture decks under e2e/fixtures/<group>, and only G2 edits examples/demo/pages. A group that adds a dependency (for example myst-transforms in the compiler or ast-grep in addon-code) must note it so pnpm-lock.yaml is regenerated at merge.

## WP-60a（G1-kernel-host-pipeline）

拥有：`packages/kernel`, `packages/compiler`, `packages/host`, `packages/addon-core`, `packages/render-slides`, `packages/web`, `packages/cli`, `e2e/core.spec.ts`, `e2e/web.spec.ts`, `e2e/smoke.spec.ts`, `e2e/fixtures/core`

### GAP-02（major；K-18, P-70）

**缺口**：The compiler does not resolve cross-reference text. {ref}`label` and {eq}`label` without explicit text become crossReference nodes with no children, so every renderer shows an empty link.

**证据**：The IR for {ref}`sec-a` is {type:'crossReference',kind:'ref',identifier:'nodes'} with no children (both probe decks). The web page shows `<a href="#nodes"></a>`.

**修法与验收**：In packages/compiler, enumerate targets and resolve references, preferably with MyST's own transforms (myst-transforms enumerate and resolve references) rather than a hand-written resolver. Write the text into the crossReference children: the section or block title, the figure or table number, or the equation number. Add a compiler or CLI integration test that builds a deck with {ref}, {eq} and {numref} and checks the children in ir.json.

### GAP-04（major；K-12）

**缺口**：PDF/PNG export of the slides form renders the live interactive components instead of the `fallback` the IR already holds, so the output depends on runtime state. Only the notebook applies fallbacks. No test checks any component's degraded form in a static export.

**证据**：`slidev export .presmium/slides/slides.md` plus pdftotext on the probe copy. The 执行面板 page shows 'n 5 运行' with no output. 本地环境 shows the error '开发服务器没有提供本地环境接口'. 课堂测验 shows a live '提交' button. Video and audio pages show '0:00' players. The IR has fallbacks for PmRunPanel, PmLocalEnv, PmQuiz, PmExercise and PmMedia. packages/render-slides/src/node/presmium.ts:31 degrades only components that have no plugin. packages/render-slides/test/slides.test.ts checks only the page count. Slidev's print signal is already used through the public @slidev/client entry: addon-publish/setup/root.ts reads useNav().isPrintMode.

**修法与验收**：Add a static/print signal to @presmium/host, for example `useStaticRender(): Ref<boolean>` on HostAdapter. The slides adapter (addon-core) implements it from useNav().isPrintMode; the web adapter returns false. In render-slides, wrap each plugin component that has an IR `fallback` in an addon-core wrapper component that renders the fallback while printing and the live component otherwise. G4 (GAP-36) makes the run-panel fallback carry recorded output. Extend packages/render-slides/test with an export of a fixture deck containing run-panel, local-env and quiz: assert that the PDF text holds the fallback content and contains neither '运行'/'提交' controls nor the local-env error text.

### GAP-05（major；K-07）

**缺口**：Per-page (per-section) plugin configuration does not exist. IRSection has only renderer `hints`. PluginContext, DirectiveContext and PassContext.config carry only the global `presmium.<id>` from the headmatter. Architecture 5.2 still documents a page-frontmatter scope that MyST sections cannot express. Only the global and node scopes work.

**证据**：packages/kernel/src/ir.ts IRSection has id, index, title, depth, source, steps, hints and blocks, and no config (verified). packages/compiler/src/blocks.ts:161-168: `{hints}` accepts only renderer-keyed mappings. In kernel.ts, `config: pluginConfig(this.#config[id])` is global only. render-slides copies `section.hints.slides` into the slide frontmatter (slidev.ts:77). Both host adapters live in packages/addon-core/src/client/host.ts and packages/web/src/client/host.ts.

**修法与验收**：Contract, which docs GAP-47 documents: a `{config}` directive inside a section, with a YAML body keyed by plugin id, stored as `IRSection.config?: Record<pluginId, Record<string, unknown>>`. Merge it over the global config in DirectiveContext and PassContext for that section. render-slides writes it to the slide frontmatter key `presmium`. @presmium/host gets `useSectionConfig(pluginId)` (global config merged with section config), implemented by the slides adapter from $frontmatter.presmium and by the web adapter from the current IR section, using the viewer's existing exports without changing packages/viewer. Add an e2e case in core.spec/web.spec with a fixture plugin option overridden in one section, in both forms.

### GAP-06（major；N-05）

**缺口**：On a 375 px phone the web form scrolls sideways whenever the deck title is longer than about 11 CJK or 20 Latin characters. The VitePress nav title does not shrink, and the Presmium view menu added to nav-bar-content-after takes the remaining space. With a classroom server, the learner badge (自主浏览 / 回到主讲进度) ends up partly off-screen and cannot be clicked. The existing 375 px test uses only the short demo title and no isMobile.

**证据**：Classroom deck titled 'Presmium Classroom Features' (scratchpad mobilewidth2.mjs): scrollWidth 446 on a 375 viewport. With isMobile the learner badge rect is [244,734,430,778]. Demo with only the title changed: '第三讲：哈希表与冲突处理' gives 398, and 'Introduction to Hash Tables' gives 423. classroom.spec at 375x812 isMobile fails at `badge(learner).getByRole('button', { name: '自主浏览' }).click()`: outside the viewport, and a <p> intercepts pointer events. packages/web/src/client/theme.ts:122 places .pm-view-menu.

**修法与验收**：In packages/web/src/client/style.css, let the nav title shrink with an ellipsis (min-width:0; overflow:hidden; text-overflow:ellipsis on .VPNavBarTitle .title), and/or move .pm-view-menu into the mobile nav screen below 768px. Extend the 375 px web.spec case to use isMobile and a long-titled fixture deck (e2e/fixtures/core), asserting that scrollWidth <= clientWidth on every page and that the classroom badge region, when present, is inside the viewport.

### GAP-09（major；N-07）

**缺口**：No English UI and no language mechanism exist. All Presmium UI strings are hard-coded Chinese, and VitePress/Slidev's own English labels sit next to them. Setting renderers.web.lang: en-US changes only <html lang>. This gap covers the mechanism plus the strings in host (start report, panels, toolbar), addon-core, web (site.ts themeConfig: outline, sidebar, doc footer, search translations) and render-slides. Viewer and add-on strings are GAP-10/11/12.

**证据**：Deck with `renderers.web: { lang: en-US }` opened with locale en-US (scratchpad i18n.mjs): html lang=en-US, but the page shows 搜索, 视图, 目录, 本页大纲, 上一节/下一节, and the slides form shows 在网页中阅读. packages/web/src/node/site.ts:85-131 has fixed Chinese outline, sidebar and search translations. Architecture section 8 claims N-07 is 'covered in e2e by Chromium', but no such test exists.

**修法与验收**：Contract shared with G2, G3 and G4: both forms set <html lang> from the deck language (one deck-level `lang`; web already maps renderers.web.lang, and slides sets it through Slidev's documented htmlAttrs headmatter). @presmium/host exports `useLocale(): Ref<'zh-CN'|'en'>` (<html lang>, then navigator.language) and a `useMessages(catalog)` helper. Move the host, addon-core, web and render-slides strings into zh-CN/en catalogs. Derive the VitePress themeConfig labels and search translations in site.ts from the lang. Add a web.spec/core.spec case that builds an en-US fixture deck and asserts English labels in the VitePress chrome, the start report and the slides form's web link.

### GAP-17（minor；K-06）

**缺口**：@presmium/host has no form-neutral scoped state API. Plugin state shared across local windows exists only in the slides form (Slidev createSyncState). In the web form SYNC_TRANSPORTS is a no-op, and only the viewer's own navigation crosses windows. Cross-device state comes only from the session plugin's classroomStore.

**证据**：packages/host/src/types.ts:30-35 (SYNC_TRANSPORTS, with the comment 'the web host has no synchronized state channels'). `grep createSyncState` finds only addon-stage/setup/screen.ts. packages/viewer/src/viewer.ts:70-72 uses BroadcastChannel for navigation only.

**修法与验收**：Add `useSharedState(key, initial, { scope: 'view' | 'local' | 'remote' })` to @presmium/host. The slides adapter (addon-core) implements it with createSyncState. The web adapter (packages/web) implements 'local' with BroadcastChannel and 'remote' through the SyncTransports port. Do not modify packages/viewer. Add a web.spec case with two windows sharing a fixture plugin's state.

### GAP-18（minor；K-07）

**缺口**：Plugin lifecycle, manifest and fault isolation are incomplete. (1) Neither host calls Kernel.dispose(), so plugin dispose hooks (classroom, session, exec-local) never run. (2) PresmiumNodePlugin has only `id`, with no version or compatible kernel/IR range, so the compiler cannot reject an incompatible node plugin. (3) Kernel-range incompatibility, a throwing setup ('failed') and dependency cycles are implemented but untested, and the web presenter window's component-error notice is not checked.

**证据**：`grep -rn 'dispose()' packages` finds no host call to kernel.dispose (verified; kernel.ts:98 defines it). packages/host/src/kernel.ts has startPresmium and no stop. packages/kernel/src/contracts.ts:232 PresmiumNodePlugin { id, resolvers, checks, anchors, directives, passes, … } (verified). `grep -rn 'satisfy\|degraded\|cycle' e2e packages/*/test` finds nothing. The core.spec presenter test covers only `${SLIDES}/presenter/2`.

**修法与验收**：Add stopPresmium to @presmium/host and call it on pagehide and HMR dispose in addon-core and web. Optionally add section enter/leave events to the EventBus. Add optional `version` and `kernel` (semver range) to PresmiumNodePlugin and have the compiler reject or warn on an incompatible plugin. Add e2e/fixtures/core plugins (incompatible kernel range, throwing setup, cycle) and core.spec/web.spec cases asserting their start-report status in both forms and the error notice in the web presenter window.

### GAP-19（minor；K-13, Principle 5）

**缺口**：Published web and slides outputs depend on the checkout location and on build order. The web publisher relativizes source positions but not plugin config, so absolute paths in config.presmium ship in dist/web/ir.json and the theme chunk. The Slidev bundle carries a favicon path derived from the absolute path. Even at a fixed location, the order of documents in the web search index (@localSearchIndexroot chunk) differs between builds, so the presmium-sw.js CACHE id changes on every rebuild and readers' offline caches are invalidated.

**证据**：`grep -rl /home/ddq dist/web` finds dist/web/ir.json and assets/chunks/theme.*.js ('"presmium.execLocal":{"workspace":"/home/ddq/…/sample-repo"}'). The slides env chunk has the favicon '../home/ddq/…/.remote-assets/…png'. Two clones at different paths differ only in execLocal.workspace, @localSearchIndexroot.*.js and presmium-sw.js. A rebuild in the same clone differs in 2 of 247 files (the search index and the SW).

**修法与验收**：In packages/web/src/node/publish.ts, relativize (or strip) absolute paths in config.presmium before publishing. Sort search documents and their ids before indexing so the index and the SW cache id are deterministic. In render-slides, set a deck-local favicon (or leave it unset) so no absolute remote-assets path is emitted. G4 fixes the source of the execLocal path (GAP-20). Add a cli/compiler integration test that builds a fixture deck (without exec-local) from two directories and twice in one directory, and compares the outputs (no absolute deck path, identical bytes).

### GAP-21（minor；K-13, Principle 5）

**缺口**：The freeze cache key includes the executor's environment fingerprint (`python3 --version`). On a machine whose interpreter version differs, the committed outputs are ignored without notice, the code re-runs, and new untracked freeze files appear. ir.md section 4 promises that anyone who builds gets the same output.

**证据**：With a fake python3 reporting 'Python 3.99.0': 'code runs: 2 executed, 0 from cache', two new untracked files in examples/demo/.presmium/freeze/, and changed cacheKey and durationMs in the IR. packages/compiler/src/execute.ts:160-161.

**修法与验收**：When the input matches a committed recording but the fingerprint differs, reuse the recording by default and warn about the version mismatch. Add a config switch to force a re-run. Add a compiler integration test using a fake interpreter on PATH.

### GAP-23（minor；N-06）

**缺口**：Slidev slide transitions ignore prefers-reduced-motion. A deck's renderers.slides.transition still slides for 500 ms under reduce, and the 100 ms v-click fade stays. Presmium's own animations already honor the setting.

**证据**：Deck with `renderers.slides.transition: slide-left` (scratchpad rm2.mjs): with reducedMotion 'reduce', document.getAnimations() after ArrowRight lists 'slide-left-leave-active | translate 500' and 'slide-left-enter-active | translate 500'. No prefers-reduced-motion rule exists in addon-core or render-slides.

**修法与验收**：In packages/addon-core/style.css, under @media (prefers-reduced-motion: reduce), set the slide transition and .slidev-vclick-target transition durations to 0, or have render-slides omit the transition when reduced motion is requested. Add a core.spec case on a fixture deck with a transition asserting no running animations after a page turn under reduce.

### GAP-24（minor；N-06）

**缺口**：The web form ignores the browser's default font size because the VitePress base CSS pins html and body to 16px. At 400% zoom (320 CSS px) every web page scrolls sideways.

**证据**：Scratchpad font.mjs (CDP Page.setFontSizes 16/24/32): web html, p and nav stay at 16px, while slides li scales from 17.6 to 35.2px. The bundled CSS has `html {font-size:16px}` and `body {font-size:16px}`. At 320 CSS px all 11 pages have scrollWidth 334.

**修法与验收**：In packages/web/src/client/style.css set `html { font-size: 100% }` and body in rem. The GAP-06 nav fix also removes the 320 px overflow. The viewer's own px-to-rem work is in GAP-13. Add web.spec cases for 200% zoom (640 CSS px at DPR 2) and for 320 px reflow without sideways scroll.

### GAP-25（minor；N-03, P-71, P-72）

**缺口**：The offline-search e2e is flaky. It presses Ctrl+K immediately after the offline reload, before VitePress has hydrated, so the shortcut is lost. It passes only because tracing slows it down. Also, no test asserts that a section heading is found by search, and none checks the in-page outline or the 'previous section' link. The product behavior works.

**证据**：e2e/web.spec.ts:77-82 openSearch presses Control+k right away (verified), and :161 calls it right after page.reload(). It failed 2 of 5 runs (nonfunctional audit) and 2 of 3 with `--trace off` (plugins-c audit). page.reload() resolves at about 39 ms, while Ctrl+K only works from about 90-190 ms. No test mentions VPDocAsideOutline or .pm-section-nav__prev. Probes show the outline [网页形态, 滚动叙事] on web.html and the previous link to /web.html working.

**修法与验收**：In openSearch, retry the shortcut inside `expect(async () => { press; expect(searchbox).toBeFocused() }).toPass()`, or wait for a hydration marker first. Add assertions that searching a section title alone returns that section, that the `.VPDocAsideOutline` links equal the page's section titles (also after a sidebar navigation), and that `.pm-section-nav__prev` names and reaches the previous section.

## WP-60b（G2-ir-runtime-and-stage）

拥有：`packages/viewer`, `packages/addon-stage`, `e2e/viewer.spec.ts`, `e2e/stage.spec.ts`, `e2e/fixtures/viewer`, `examples/demo/pages`

### GAP-01（major；K-18, P-70）

**缺口**：The web renderer reports support() => 'full' for every node, but the IR runtime renders standard MyST nodes wrongly. {sub}, {sup} and {kbd} become a block <div> inside <p>. That breaks the paragraph, causes a hydration mismatch and repeats text. Definition lists and {dropdown} fall back to plain divs instead of dl/dt/dd and details/summary. The admonition :class: is ignored. A crossReference with no children renders an empty <a>. No test uses MyST built-in roles or directives in any form, and the demo uses none of them.

**证据**：Probe deck output: `<p>参见 <a href="#eq1"></a> … 以及 <div>x</div> 和 <abbr>IR</abbr>。</p><div>x</div> 和 <abbr>IR</abbr>。` plus the console warning 'Hydration completed but contains mismatches.' A second probe gave `参见 <a href="#nodes"></a> … 按 <div>Ctrl</div> 键，H<div>2</div>O 与 x<div>2</div>`. Verified in packages/viewer/src/markdown.ts: the custom handlers cover only math, inlineMath, mermaid, code, admonition, footnotes, container, caption, legend, abbreviation, crossReference (children only), div and span. Every other node goes to the mdast-util-to-hast default. Also packages/web/src/node/renderer.ts:36 `support: () => 'full'`.

**修法与验收**：Add hast handlers in packages/viewer/src/markdown.ts: keyboard→kbd, subscript→sub, superscript→sup, definitionList/definitionTerm/definitionDescription→dl/dt/dd, details/summary→details/summary. Apply the admonition `class` to the aside, and use inline elements (span) for unknown phrasing content. For a crossReference that is still childless (the compiler fills the text, see GAP-02), fall back to the target section's title or the identifier, so the link is never empty. Add e2e/fixtures/viewer/myst, a deck using these roles and directives, and a viewer.spec case asserting the expected DOM in the web form with no hydration-mismatch console message.

### GAP-07（major；P-20, K-19）

**缺口**：In the web form, the server-rendered '运行' button of a code block with run 'both' stays disabled after a reload, although an executor is present (no 执行服务不可用 hint). The SSR markup has `disabled`, and Vue's production hydration keeps it when the executor already exists at hydration time. The existing e2e passes only because it tests a first load.

**证据**：Scratchpad exe2.mjs: with the service worker allowed, the button is enabled on first load and on the first reload, and disabled on the second reload. With the SW blocked: enabled on first load, disabled on reload. The built exec.html contains `pm-code-block__run"><button type="button" disabled>运行`. packages/viewer/src/code.ts:170 `disabled: running.value || !executor.value` (verified).

**修法与验收**：Make the server render agree with the first client render: set a `mounted` ref in onMounted and compute `disabled` from it (disabled until mounted, then from the executor), or render the run controls client-only. Add a viewer.spec case that reloads /exec.html twice and runs the block successfully.

### GAP-08（major；P-04, K-09, K-13）

**缺口**：Drawings made under `presmium dev` go into the git-ignored generated directory (<deck>/.presmium/dev/slides/.presmium/drawings), not <deck>/.presmium/drawings, so they never reach the repository or later builds. For builds, the preparser writes an absolute `drawings.persist`, which leaks the author's path into the slides bundle. Saving to the repo and clearing a drawing are untested. This is also the only remaining K-09 write-back path, because P-25 code commit is descoped (WBS WP-44).

**证据**：`presmium dev --to slides` plus one stroke: the SVG is written to <deck>/.presmium/dev/slides/.presmium/drawings/1.svg (that .gitignore is `*`), and nothing goes to <deck>/.presmium/drawings. packages/addon-stage/setup/preparser.ts only redirects when `basename(dirname(dir)) === '.presmium'` (verified), and it joins an absolute path. dist/slides/assets/slidev/env-*.js contains `persist:'/home/ddq/…/.presmium/drawings'`. The only test is e2e/stage.spec.ts:116, which checks a reload on the static build (browser storage only). examples/demo/pages/stage.md claims '开发服务器把标注写入 .presmium/drawings'.

**修法与验收**：In the preparser, find the nearest `.presmium` ancestor of the generated deck directory, whatever its depth (slides or dev/slides), and set `drawings.persist` to a path relative to the generated deck that points at <deck>/.presmium/drawings. Never write an absolute path. Add an integration test in packages/addon-stage/test: run `presmium dev --to slides`, draw through the page, assert that <deck>/.presmium/drawings/<n>.svg exists, clear it with the toolbar and assert the file is gone, then check that `presmium build` ships it and that dist/slides contains no absolute deck path.

### GAP-10（major；N-07）

**缺口**：All IR runtime (viewer) and stage UI strings are hard-coded Chinese: view labels, the present bar, section navigation and code block controls.

**证据**：packages/viewer/src/index.ts:16-19 (view labels), present.ts:82-97 (上一步/下一步/演讲者窗口/全屏/退出放映), section.ts:197-212, code.ts:62-171, markdown.ts ADMONITIONS. The en-US probe shows them in Chinese.

**修法与验收**：Put the viewer and addon-stage strings into zh-CN/en catalogs, selected by the GAP-09 rule: document.documentElement.lang, falling back to navigator.language. Use @presmium/host's useLocale after G1 merges if preferred. Add a viewer.spec case on an en-US fixture deck (e2e/fixtures/viewer) asserting English labels in the present view and the code block controls.

### GAP-13（minor；N-05）

**缺口**：The web present view does not fit its content to the display. Its font is clamp(1rem, 2vw, 1.75rem), while code and tables use fixed px, so at common projector resolutions some sections are cut off and need scrolling inside the slide. No test covers any aspect ratio. The slides form fits every tested size.

**证据**：Scratchpad n05b.mjs and n05c.mjs, ?view=present: stage-basics overflows at 1280x720 (scrollHeight 784 vs clientHeight 669, code block cut), 1366x768 and 1024x768; publish overflows at 1280x720, 1366x768 and 1280x800. packages/viewer/src/style.css:390-397 (.pm-present__slide overflow:auto and the clamp). The slides form fits at 10 sizes (n05.mjs).

**修法与验收**：Fit the present slide to the viewport: scale .pm-present__slide to its available height (measure and transform), or size type with min(vw,vh) in rem/em, with code and tables in em. Add a viewer.spec case that walks every demo section in ?view=present at 1280x720, 1024x768 and 1280x800 and asserts no overflow, plus a stage.spec check of the slides form at one 4:3 and one 16:10 size.

### GAP-14（minor；N-06）

**缺口**：Keyboard-only use breaks in the present overlay. Tab leaves the full-screen present view and moves into the hidden page behind it, starting with 'Skip to content'. Escape from the present view leaves focus on <body>.

**证据**：Scratchpad kbd3.mjs: present tab stops are 'BUTTON 退出放映', then 'BODY', then 'A Skip to content' (inPresent=false). kbd4.mjs: focus after Esc is BODY. Only the spotlight Tab case and arrow-key paging are tested.

**修法与验收**：While the present or presenter overlay is shown, make the rest of the document inert (the `inert` attribute on the app root siblings) or trap focus. On exit, return focus to the control that opened the overlay (the view menu). Add a viewer.spec case that enters the present view, tabs through it, pages with keys and exits with Escape, asserting focus stays inside and then returns to the view menu.

### GAP-15（minor；K-15, P-03）

**缺口**：The web present and presenter views hard-code their keys (arrows, PageUp/PageDown, space, Home, End, Escape, p). There is no named-action registry, and plugins cannot add actions. So blackout and freeze (P-03), which exist only through Slidev setup/shortcuts, are missing from the IR runtime's present view that P-76 names for everyday presenting.

**证据**：packages/viewer/src/present.ts:16-41 (`useKeys` with fixed NEXT/PREV sets). ViewerPluginContext (packages/viewer/src/plugins.ts) has only registerView, registerNodeRenderer, registerComponent, useViewer, SectionView and BlockView. b/f exist only in packages/addon-stage/setup/shortcuts.ts, setup/screen.ts and global-top.vue. packages/addon-stage/src/client is empty. Web loads a package's src/client/viewer.ts automatically (packages/web/src/node/addons.ts:7,45).

**修法与验收**：Add `registerAction({ id, keys, run, views })` to ViewerPluginContext and have the present and presenter views look up keys there. Move the built-in navigation keys onto it. Add a viewer-level present-state primitive synced to the audience window over the viewer's existing BroadcastChannel. Add packages/addon-stage/src/client/viewer.ts registering b/f (blackout and freeze) with an overlay synced to the audience window. Add a viewer.spec/stage.spec case: in ?view=present, pressing b blacks out the audience window and pressing b again restores it.

### GAP-16（minor；K-05）

**缺口**：The web present view (the primary medium) has no page overview. Neither form tests fullscreen or overview, and the web presenter window's current-screen area is not asserted.

**证据**：`grep -rn 'overview\|总览' packages/viewer/src packages/web/src` finds nothing (verified). viewer.spec.ts asserts only .pm-current, .pm-presenter__next and .pm-presenter__timer.

**修法与验收**：Add an overview to the present view: a grid of sections opened with 'o' that jumps on Enter or click and is reachable by keyboard. Add viewer.spec cases for the overview, for fullscreen (requestFullscreen called), and for the presenter window's current screen, plus a stage.spec smoke check of Slidev's overview in the slides form.

### GAP-43（minor；Architecture section 3 (exports convention)）

**缺口**：The './client' export of @presmium/slidev-addon-stage points to src/client/index.ts, which does not exist.

**证据**：packages/addon-stage/package.json:14 `"./client": "./src/client/index.ts"`, and src/client is empty (verified). Importing '@presmium/slidev-addon-stage/client' fails with ERR_MODULE_NOT_FOUND.

**修法与验收**：Add src/client/index.ts (for example re-exporting the GAP-15 viewer plugin and stage state) or drop the export.

### GAP-45（minor；P-01）

**缺口**：Markdown images written in the source are untested. Neither the demo nor any test contains one; the only image covered is the generated PlantUML diagram.

**证据**：No `![` appears in examples/demo/pages/*.md or lecture.md. A probe with ![…](img/dot.png) in an included page loads in slides (/assets/dot-*.png) and on the web (/media/*-dot.png).

**修法与验收**：Add a source-relative image in an included page of examples/demo/pages/stage.md (commit the image under examples/demo/pages/img) and assert in e2e/stage.spec.ts that it loads (naturalWidth > 0) in both forms.

## WP-60c（G3-classroom-content-code-editor）

拥有：`packages/addon-classroom`, `packages/addon-session`, `packages/classroom-server`, `packages/addon-content`, `packages/addon-code`, `packages/addon-guide`, `packages/language-server`, `packages/vscode`, `e2e/classroom.spec.ts`, `e2e/session.spec.ts`, `e2e/content.spec.ts`, `e2e/code.spec.ts`, `e2e/guide.spec.ts`, `e2e/preview.spec.ts`, `e2e/fixtures/plugins`

### GAP-11（major；N-07）

**缺口**：The UI strings of the session, classroom, content, guide and code plugins are hard-coded Chinese.

**证据**：packages/addon-session/src/client/SessionPanel.vue, packages/addon-classroom/src/client/*.vue, and the addon-content, addon-guide and addon-code components (part of the about 45 files counted by the nonfunctional auditor).

**修法与验收**：Give each package a zh-CN/en catalog selected by the GAP-09 rule (<html lang>, then navigator.language). Add a session.spec or classroom.spec case on an en-US fixture deck asserting English labels in the session panel and quiz.

### GAP-26（minor；N-06）

**缺口**：The markmap fold toggles (SVG circles with cursor:pointer) cannot be reached by keyboard.

**证据**：Scratchpad kbd1.mjs finds pointer-only elements only at 'circle' on content.html and slide 17.

**修法与验收**：In addon-content's markmap component, make node toggles focusable (tabindex, role=button, aria-expanded, Enter/Space) or add keyboard fold-all/unfold-all controls. Add a content.spec case that folds a node by keyboard.

### GAP-27（minor；P-60）

**缺口**：Only the client UI enforces presenter rights. Any participant with the join link can end the classroom, open or close quizzes, or overwrite other learners' answers by writing to the shared Yjs document, and the server accepts it. This breaks the domain-model section 8 invariant. Only archiving is guarded, by the claim key. The trust decision is recorded only in a source comment.

**证据**：packages/classroom-server/src/index.ts header ('the presenter's rights … are enforced by the clients only'). Room.handle applies any sync update while status != 'ended'. Probe cls/classroom.probe.cjs: a raw y-websocket client without the presenter role ran doc.getMap('session').set('status','ended'), and both the learner and the presenter then showed 课堂已结束.

**修法与验收**：Enforce on the server: accept writes to session.status and store:quizzes only from the connection that holds the room's claim key, and accept store:answers entries only under the sender's own participant id (inspect decoded Yjs updates, or route presenter actions through authenticated messages). Add a classroom-server integration test where a non-presenter's end/open write is rejected. GAP-49 records the trust model in docs.

### GAP-28（minor；P-64）

**缺口**：Classroom membership lives in per-tab sessionStorage, so a projector window opened the way Slidev recommends (play mode in a second tab) is not in the classroom. During a live quiz it shows a self-test with a 提交 button and no tally, and clicking 提交 reveals the answer to the room.

**证据**：packages/addon-session/src/client/classroom.ts uses sessionStorage (STORAGE_KEY). In PmQuiz.vue, !joined means self-test. Probe cls/projector.probe.cjs: projector tab /5 shows '自测：选择后提交，立即看到对错' with tally 0, while a window.open popup shows '作答已关闭' and the tally. vendor/docs/slidev/guide/ui.md:47 recommends two windows.

**修法与验收**：Share the presenter's membership across same-origin tabs of the same deck (localStorage keyed by deck and room, or a BroadcastChannel handshake), so audience views render the presenter's tally. At minimum, show a read-only quiz state instead of a self-test in a non-member view while this browser hosts an active classroom. Add a classroom.spec step with a projector tab opened by URL.

### GAP-29（minor；P-42）

**缺口**：Online video cannot be embedded through the IR pipeline. A <Youtube> component works only in slides and renders an empty element on the web with no warning. Remote URLs in {video}/{audio} are rejected, and the slides build fails.

**证据**：Probe: `<Youtube id="luoMHjh-XcQ" />` renders an iframe in slides and an empty `<youtube id=…></youtube>` on the web. ```{video} https://example.com/clip.mp4``` gives 'error {video}: file not found', and slides.md gets `<video src="../../https:/example.com/clip.mp4">`. packages/addon-content/src/node/media.ts resolveMedia accepts only local or package paths. e2e/content.spec.ts covers only local webm, ogg and gif.

**修法与验收**：Allow http(s) URLs in {video} and {audio} and pass them through unchanged. Add a {youtube} directive producing a component that renders an iframe in both forms (registered for the web through addon-content's client plugin), with a notebook and export fallback link. Add one content.spec assertion per form.

### GAP-30（minor；K-08）

**缺口**：The K-08 acceptance criterion (replacing the session implementation needs no quiz change) is untested, and so is the 'degraded' start status when an optional service is missing.

**证据**：`ctx.provide(SESSION` appears only in packages/addon-session/src/client/plugin.ts. core.spec and web.spec check only 'started' and 'disabled'. A probe with only addon-classroom shows 'presmium.classroom 已降级：optional services unavailable: presmium.session, presmium.classroomStore, presmium.executor'.

**修法与验收**：Add an e2e/fixtures/plugins in-memory provider of presmium.session and presmium.classroomStore. Add a classroom.spec case: with that provider in place of addon-session, a quiz round works unmodified and the start report names the fixture as provider. Add a case asserting the 'degraded' status and its reason.

### GAP-31（minor；P-60, P-63）

**缺口**：Two classroom behaviors work but nothing guards them. (1) Joining via the QR link: it has no &name=, so the learner goes through the SessionBadge nickname form, but every e2e appends &name=. (2) The defining property of notes, that they stay in place after the deck or the referenced code changes, is untested.

**证据**：e2e/session.spec.ts and classroom.spec.ts always append &name=. Probe 'web: QR-style link without a name asks for a nickname and joins' passes. Notes are keyed by section id and block label (addon-classroom/src/domain/notes.ts, place.ts). Probe notes.probe.cjs, which inserts a section and paragraphs and edits cart.ts before rebuilding, passes.

**修法与验收**：Add a session.spec step: the learner opens the bare join link, fills 昵称, clicks 加入课堂 and appears in the presenter's 参与者 list. Add a classroom.spec case: add notes to a section and a labelled {code-ref} block, edit the fixture deck and the referenced code, rebuild, and assert both notes are still attached.

### GAP-32（minor；P-11）

**缺口**：Syntax-tree anchors support only declaration names (`symbol:file#A.b`). Fragments cannot be located by syntactic structure.

**证据**：packages/addon-code/src/node/symbol.ts is the only syntax-tree resolver. presmium.ts registers only regionResolver and symbolResolver.

**修法与验收**：Add a `pattern:<file>#<ast-grep pattern>` resolver using @ast-grep/napi (an existing component), with the same fuzzy and lock handling, and record the dependency for the lockfile regeneration. Add cases to packages/addon-code/test/check.test.ts. If this is rejected, GAP-50 must narrow the P-11 wording instead; coordinate with G4.

### GAP-33（minor；P-12, P-80）

**缺口**：Some working code features are untested: code references into a git submodule (P-12), and at the LSP level, drift diagnostics, completion after `symbol:<file>#`, and definition/hover of symbol anchors (P-80).

**证据**：A grep for 'submodule' in tests finds nothing, although packages/addon-code/src/node/git.ts handles .gitmodules. A submodule probe gives the correct code and the permalink https://github.com/acme/lib/blob/<sha>/src/x.ts#L2-L6. packages/language-server/test/lsp.test.ts covers only lost-anchor and unknown-option diagnostics plus region definition, hover and completion. Probe: presmium.code.drift severity 2 and symbol completion [Parser, Parser.__init__, Parser.parse, helper].

**修法与验收**：Add a submodule case to packages/addon-code/test/check.test.ts asserting the pinned code and the submodule-remote permalink. Add lsp.test.ts cases: a pinned anchor whose code changes yields presmium.code.drift; completion after `symbol:<file>#` lists declarations; definition and hover work for a symbol anchor.

### GAP-34（minor；P-81）

**缺口**：Preview sync is untested end to end. The VS Code extension's follow logic (debounce, presmium/section, then `#id` on the same page or `?section=` on another page) has no test. The extension test only type-checks and bundles.

**证据**：packages/vscode/src/extension.ts holds the follow logic. packages/vscode/test/build.test.ts runs only tsc and the bundle build. The probe confirmed that presmium/section returns {id:'scrolly', link:'/web.html#scrolly'} and that the dev server scrolls to the heading.

**修法与验收**：Move the URL choice (urlOf: hash vs ?section) into a pure function in @presmium/language-server's domain entry. Add e2e/preview.spec.ts: start presmium/preview, navigate as the extension does for two cursor positions (same page, other page), and assert the section heading is in the viewport.

### GAP-44（minor；Architecture section 3 (exports convention)）

**缺口**：The './client' export of @presmium/slidev-addon-code points to src/client/index.ts, which does not exist.

**证据**：packages/addon-code/package.json:14 `"./client": "./src/client/index.ts"`, and src/client is empty (verified).

**修法与验收**：Drop the export, or add the entry file if the package gains a client plugin.

## WP-60d（G4-exec-publish-notebook-docs）

拥有：`packages/addon-exec`, `packages/addon-exec-local`, `packages/addon-publish`, `packages/render-notebook`, `e2e/exec.spec.ts`, `e2e/exec-local.spec.ts`, `e2e/publish.spec.ts`, `e2e/perf.spec.ts`, `e2e/urls.ts`, `e2e/fixtures/exec`, `playwright.config.ts`, `scripts`, `docs`, `CLAUDE.md`, `package.json`, `pnpm-lock.yaml`, `.gitignore`, `examples/demo/.presmium`

### GAP-03（major；K-18）

**缺口**：The notebook renderer writes raw MyST directive syntax (`:::{note}`, `:::{list-table}`) into Markdown cells. Jupyter cannot render it, and nothing is listed as degraded in the build report.

**证据**：Probe deck examples/demo/.presmium/audit-k/myst with {note}, {list-table}, {dropdown} and others: `presmium build --to notebook` writes the directive syntax into the cells, and `presmium build` reports nothing unrendered.

**修法与验收**：In packages/render-notebook, convert MyST-only nodes to CommonMark or HTML that Jupyter renders: admonition→blockquote with a bold title, list-table→a GFM table, dropdown→<details>, math→$$, figure→image plus caption. Whatever cannot be converted must be reported as degraded in the build report. Add a render-notebook test that builds such a deck and asserts that no `:::{` remains in the cells and that the report lists the degraded nodes.

### GAP-12（major；N-07）

**缺口**：The UI strings of the exec, exec-local and publish plugins (run panel, local env, contrast toggle and others) are hard-coded Chinese.

**证据**：packages/addon-exec, packages/addon-exec-local and packages/addon-publish client components. In the en-US probe the run panel shows 运行 and 执行服务不可用.

**修法与验收**：Give each package a zh-CN/en catalog selected by the GAP-09 rule. Add an exec.spec case on an en-US fixture deck asserting English run-panel labels.

### GAP-20（minor；K-13）

**缺口**：The addon-exec-local pass writes the resolved absolute workspace into doc.config.presmium['presmium.execLocal'].workspace, so it reaches both published forms.

**证据**：packages/addon-exec-local/src/node/pass.ts:35-38 `doc.config.presmium = { …, [EXEC_LOCAL_ID]: { ...ctx.config, workspace } }`, where workspace is `resolve(ctx.deckDir, …)` (verified).

**修法与验收**：Keep the workspace deck-relative in doc.config (resolve it only on the Node side where the container binds it), or keep the absolute path in a Node-only field that is never published. Add a check in packages/addon-exec-local/test that the built ir.json and the slides bundle contain no absolute workspace path.

### GAP-22（minor；K-13, Principle 5）

**缺口**：Committed caches are incomplete. The root .gitignore ignores .presmium/assets, where remote images such as the PlantUML diagram are localized, so a new localized asset is silently left untracked and a fresh checkout has to reach the remote server at build time. Architecture 4.3 says .presmium/anchors.lock.json is committed with the deck, but the demo has none.

**证据**：.gitignore: `**/.presmium/*` with exceptions only for freeze/, anchors.lock.json and drawings/ (verified). examples/demo/.presmium/assets/81cc0b28a328938f.svg is tracked only because it was force-added. examples/demo/.presmium contains assets, freeze, slides and web, with no anchors.lock.json (verified). `presmium check --update-lock` creates one with 2 anchors.

**修法与验收**：Add `!**/.presmium/assets/` to .gitignore and document committing it. Run `presmium check --update-lock` on the demo and commit examples/demo/.presmium/anchors.lock.json.

### GAP-35（minor；P-20）

**缺口**：Only Python can run, in either form. No JavaScript or TypeScript executor exists, and `{monaco-run}` cannot be reached from MyST, so setup/code-runners.ts is dead code. The demo's sample repo is TypeScript and cannot be run.

**证据**：packages/addon-exec/src/client/plugin.ts:25 registers only pyodide (verified). A `{run-panel} javascript` probe shows '没有支持 javascript 的执行器' in both forms, and the build warns 'no executor for javascript'. A ```ts {monaco-run}``` block becomes a plain ```ts block in slides.md.

**修法与验收**：Register a browser JS/TS executor in the router: a Worker that evaluates JS and strips TS types with an existing tool such as sucrase or esbuild-wasm. `{run-panel}` and `:run: live` then work for javascript/typescript in both forms. Remove setup/code-runners.ts or make it use the same executor. Add an exec.spec case running JS in both forms.

### GAP-36（minor；P-75, K-12）

**缺口**：Recorded output is missing from static forms. A {run-panel} with :run: live, :timeout: and :recorded: becomes a notebook code cell with no outputs and no timeout guard, so the demo notebook hangs on the timeout-demo cell. The run-panel component's IR `fallback` holds only the code, so a static export (GAP-04) cannot show recorded output either.

**证据**：`python3 packages/render-notebook/test/notebook.py run` on the demo notebook raises CellTimeoutError on 'x = 1.0\nwhile True: …'. The IR props are {timeout:1500, recorded:'x = 1.4142135623730951（√2，预先录制）'} and the cell has outputs []. packages/addon-exec/src/node/extensions.ts:56-62 notebookCell copies only source.outputs (verified). directives.ts:59 `fallback: { type: 'root', children: [{ type: 'code', lang, value: code.value }] }` (verified).

**修法与验收**：In notebookCell, attach props.recorded (or the compile-time outputs) as a stream output, and tag cells that have a timeout or never terminate (for example 'skip-execution'/'raises-exception' metadata), or emit them as Markdown fences. In directives.ts, include the recorded or compile-time output in the component fallback (code plus an output block). Add a render-notebook or addon-exec test that runs the demo notebook top to bottom.

### GAP-37（minor；P-52）

**缺口**：The web form has no global high-contrast switch. It exists only where an author places {component} PmContrastToggle (in the demo, only publish.html) or through the OS prefers-contrast setting. The slides form has it in the nav bar.

**证据**：`grep -rn TOOLBAR packages/addon-publish/src` finds nothing (verified). Probe toggle.probe.cjs: index.html and code.html have 0 switches named 高对比度, publish.html has 1. With the setting on, every page passes AA.

**修法与验收**：Register the switch through the host TOOLBAR service in publishPlugin.setup, so every web page has it. Add a publish.spec assertion on a page without PmContrastToggle.

### GAP-38（minor；P-13, P-50, P-53）

**缺口**：Export and diff paths that work are unguarded. The export test checks a hand-written Markdown permalink, not one generated from {code-ref}. No test runs presmium-export --with-clicks. presmium-diff --install (needed for host-upgrade regression) is untested.

**证据**：packages/addon-publish/test/fixtures/deck/lecture.md:15 is a literal link. Probe: presmium-export --with-clicks on a {code-ref} with :pin: 035d111 gives exit 0 and the permalink on pages 1-3; the demo gives 67 pages and 0 lost links. diff --install in a scratch clone with a CSS change lists page 002-01, while without --install it only warns.

**修法与验收**：Replace the hand-written link in the export fixture with a {code-ref} (with :steps:) to a small committed file, run presmium-export --with-clicks, and assert the generated permalink is on every step page. Add a diff.test.ts case: a fixture repo with a lockfile and a commit changing a dependency's or workspace addon's CSS; --install lists the page, and the run without --install warns.

### GAP-39（minor；N-01, N-02）

**缺口**：The first-render (<2 s, 100 pages) and step-switch (<100 ms) targets are met when measured, but architecture section 8 claims e2e timing assertions that do not exist.

**证据**：100-section probe deck: slides /1 114-283 ms, web 134-327 ms, present 234-433 ms (834-978 ms at 4x throttle). Step switches 2-49 ms. 59-60 fps during guide, mindmap and present animations. The only timing tests found are search (300 ms) and dev-update (300 ms).

**修法与验收**：Add e2e/perf.spec.ts. In beforeAll, generate and build a 100-section deck in a temp directory. Assert that the first slide, the web first section and ?view=present are visible within 2 s in a fresh context, and that a slides click, a slides page turn and a web present step render within 100 ms (keydown timeStamp to rAF poll).

### GAP-40（minor；N-04）

**缺口**：Only Chromium is ever tested. Firefox, Safari and Edge are deferred to a manual check before release, but no record of that check exists.

**证据**：playwright.config.ts uses a single `devices['Desktop Chrome']` (verified), and the firefox and webkit browsers are not installed.

**修法与验收**：Add firefox and webkit projects to playwright.config.ts that run at least smoke.spec, with the browsers installed through `playwright install`. Report failures in other groups' specs rather than fixing them here. Alternatively, add a dated manual verification checklist under docs.

### GAP-41（minor；Test policy）

**缺口**：(1) Root devDependencies still include @vue/test-utils and happy-dom, component unit-test tools that nothing uses and that invite forbidden tests. (2) addon-exec-local's test uses a fixed in-repo scratch directory that it deletes, so parallel `pnpm test` runs in one checkout break each other.

**证据**：package.json devDependencies list both (verified). local-env.test.ts:24 `const REPO = join(PACKAGE, 'test/.tmp/repo')` (verified). The audit's main-repo run failed with 'ENOENT … uv_cwd', while a fresh clone passed 39/39.

**修法与验收**：Remove @vue/test-utils and happy-dom from package.json and regenerate pnpm-lock.yaml. Use mkdtempSync under os.tmpdir() for the local-env repository, as the publish and slides tests already do.

### GAP-42（minor；Layering (architecture section 3)）

**缺口**：scripts/check-layering.mjs enforces only part of the architecture section 3 table. It misses src/node importing vue, src/domain importing bare Node built-ins or escaping to ../client or ../node, components and src/client importing any @slidev/* other than @slidev/client, cross-addon imports, and require() calls. No current code violates these rules, but the gate would not catch a regression.

**证据**：Planted probes (src/node importing vue, src/domain importing 'fs' or '../client', a component importing @slidev/types and another addon's domain, require('vitepress')) all passed with 'layering ok'.

**修法与验收**：Add rules for each case above, match require() and dynamic import(), and make the script fail on the planted cases (verified in a scratch copy).

### GAP-46（minor；Doc/code consistency: CLAUDE.md, wbs.md）

**缺口**：(1) CLAUDE.md and the wbs.md general completion standard 2 list `pnpm demo:web`, which does not exist, and describe demo:build as a slides-only build, although it now builds every renderer. (2) CLAUDE.md says only addon-core uses @slidev/client, but addon-stage, addon-guide, addon-publish setup/global layers and web/custom-nav-controls.vue also import it, which architecture section 3 allows. (3) CLAUDE.md still frames the system as Markdown→Slidev/VitePress, and its required reading omits docs/ir.md and packages/kernel/src/ir.ts. (4) wbs.md calls the classroom directive {question} (the code has {question-box}), and WP status marks are stale (WP-31 and other merged WPs are not marked done).

**证据**：Root scripts: test, demo:build, demo:check, demo:ir, e2e, verify, docs:fetch (verified). `pnpm demo:web` fails with ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL. wbs.md line 379 has `{question}`.

**修法与验收**：Update CLAUDE.md: remove demo:web (or add the script), describe demo:build correctly, align the @slidev/client rule with architecture section 3, describe the IR pipeline, and add docs/ir.md and kernel/src/ir.ts to the required reading. In wbs.md, fix the demo:web reference, the directive name and the WP status marks.

### GAP-47（minor；Doc/code consistency: architecture.md, K-07）

**缺口**：Several statements in architecture.md no longer match the code. (1) Section 4.4 omits HostAdapter.startReport and documents useStep as block-relative, while the code's useStep is the absolute slide or section step (Infinity in the document view) and useStepState subtracts the scope's `at`; an author following the doc would subtract twice. (2) Section 5.2 documents a page-frontmatter config scope that MyST cannot express. (3) Section 5.6 documents <div doc-only>/<div slide-only> markers; only addon-core hides doc-only, and nothing hides slide-only. (4) The section 8 coverage table lacks K-17..K-20, P-75..P-77, P-80 and P-81, still credits Slidev for K-01, K-02 and K-11, and claims N-01, N-02 and N-07 e2e coverage that does not exist.

**证据**：packages/host/src/types.ts:14-20 and host.ts:31-35. `grep slide-only` finds only `[doc-only]` in packages/addon-core/style.css (verified). architecture.md:186-191 section 5.2 '单页 | 页 frontmatter …' (verified).

**修法与验收**：Correct section 4.4 to match host/src/types.ts, including startReport and the absolute-step semantics. Rewrite section 5.2 for the GAP-05 contract: a `{config}` directive whose YAML body is keyed by plugin id, stored as IRSection.config, merged over the global config and read through host useSectionConfig. Replace section 5.6 with {only}/{hints}. Regenerate the section 8 coverage table from the requirement ids, pointing N-01/N-02 at e2e/perf.spec.ts and N-07 at the GAP-09..12 tests. Document the new host APIs: useSharedState, useLocale, useStaticRender and stopPresmium.

### GAP-48（minor；Principle 5.4.1 (public interfaces only)）

**缺口**：Several undocumented framework internals are in use, and only the first is listed as a risk in architecture section 9. (1) packages/web/src/node/vite.ts:65-104 replaces VitePress's '/@localSearchIndex' virtual modules in dev. (2) The kernel start in slides depends on Slidev's undocumented setup/root.ts (defineRootSetup) in addon-core and addon-publish, and on its ordering. (3) addon-stage/global-top.vue:15 uses `.slidev-slide-content`, and addon-publish/src/client/contrast.css:75 targets `.slidev-code-dishonored`. scripts/check-layering.mjs cannot detect any of these.

**证据**：A grep of vendor/docs (Slidev v53.0.0, VitePress v1.6.4) finds no defineRootSetup, setup/root, slidev-slide-content, slidev-code-dishonored or localSearchIndex. defineRootSetup appears only as a type export in @slidev/types/dist/index.d.mts:1198.

**修法与验收**：In docs/architecture.md section 9, list every remaining internal with the e2e case that guards it. In packages/addon-publish/src/client/contrast.css, replace the `.slidev-code-dishonored` dependency with a Presmium-owned class or documented markup. The addon-core and addon-stage replacements, through a documented hook or global layer, are left as follow-ups recorded in section 9.

### GAP-49（minor；Doc/code consistency: domain-model.md, P-60）

**缺口**：domain-model.md is stale. (1) Section 2 forbids @slidev/* outside host adaptation, which conflicts with architecture section 3 and the code. (2) Section 4 says PresenterPanel is not shown in the web form, but web shows it (web/src/client/theme.ts:127). (3) Section 9 still describes the v0.5 Slidev-derived web conversion (WebSection from slides and notes, Downgrade of v-click, and so on). (4) Many glossary identifiers have no counterpart in code (SectionPatch→LiveUpdate, View→ViewDefinition, CodeRef/Pin→CodeRefSpec/CodeRefOrigin, CursorPath→Waypoint, plus ClassSession, Drift, Permalink and others with no type). (5) The documented domain events (DocumentCompiled, RunRecorded, AnchorLost, QuizOpened, …) are never defined or emitted. (6) The editing context (language-server, vscode) is missing. (7) The classroom trust model is not recorded.

**证据**：grep finds no type for the listed identifiers and no emission of the event names; events.emit is used only in packages/kernel/src.

**修法与验收**：Rewrite section 9 for the IR pipeline. Align sections 2 and 4 with architecture sections 3 and 4.5. Rename glossary entries to the code identifiers, drop types that do not exist, drop or mark as future the unemitted domain events, and add the editing context. In section 8, state that the classroom server enforces presenter rights (GAP-27).

### GAP-50（minor；Doc/code consistency: ir.md, requirements.md, P-64, P-65, P-66, P-67, K-09, P-11）

**缺口**：(1) ir.md section 5.1 omits the classroom directives {quiz}, {exercise}, {question-box} (:target:) and {pulse} (:levels:), the 'classroom-places' pass, and the presmium.session.server config. (2) The section 2.1 example uses `presmium.code: { remote: … }`, but the code reads only `repo`, so a copying author silently gets no permalinks; `renderers.web.search: true` is not a WebRendererConfig option. (3) Section 7 says build uses all installed renderers by default, but the code uses the configured ones. (4) requirements.md names a nonexistent '@presmium/core' Slidev addon. Its kernel '实现' notes (K-05, K-06, K-07, K-12, K-15) still describe Slidev as the host. K-09 still requires code write-back, although P-25 is descoped (WBS WP-44) and principle 6 says rendered products do not write back.

**证据**：grep finds no quiz, question-box or :target: in docs/ir.md. addon-code/src/domain/config.ts:11 returns only { repo }. compiler/src/renderers.ts selectRenderers. requirements.md:211 mentions @presmium/core.

**修法与验收**：Add classroom and session rows to ir.md section 5.1 (arguments, body, options, generated component, notebook fallback) and the classroom-places pass. Fix the 2.1 example keys (repo; drop search). Correct the section 7 default. Document the `{config}` directive (GAP-05 contract). In requirements.md, rename @presmium/core to @presmium/kernel plus @presmium/slidev-addon-core, update the kernel 实现 notes for the IR pipeline, and narrow K-09 write-back to annotations, marking code write-back as descoped with P-25.

### GAP-51（minor；Principle 1, Principle 2, Principle 4）

**缺口**：The principles and the documented design contradict each other. (1) Principle 2 says the micro-kernel knows no business concepts, yet @presmium/kernel defines EXECUTOR and RunRequest, SessionService, Role 'presenter'|'learner', ClassroomStore, and the CodeNode run and outputs; architecture 4.5 adopts this shared-kernel placement on purpose. (2) The web renderer hand-writes a 68-line service worker instead of using vite-plugin-pwa, which is already a dependency (used for slides by addon-publish), and no rationale is recorded. (3) Web reads the publish plugin's config by plugin id ('presmium.publish'.offline). (4) The classroom notes layer depends on the IR runtime's undocumented DOM markup (.pm-section[data-section], .pm-block[data-block]).

**证据**：packages/kernel/src/contracts.ts:249-378. packages/web/src/node/offline.ts. packages/web/src/domain/config.ts:56-61. packages/addon-classroom/src/client/NotesLayer.vue:4,37-45. A grep for pwa or workbox in packages/web/src and docs finds nothing.

**修法与验收**：Amend principle 2 in requirements.md and architecture.md to allow shared business service contracts in the kernel package (as architecture 4.5 already does), or record a plan to move them. In architecture.md, record why the web SW is hand-written (or plan the switch to @vite-pwa/vitepress) and list the publish-config-by-id and notes-DOM couplings as known extension-point gaps, naming the markup that is now a contract (data-section, data-block).
