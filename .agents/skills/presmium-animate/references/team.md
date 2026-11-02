# Making one piece with several agents

A long explainer (many pages, a hundred steps) can be made by a coordinator and several agents working in parallel, one or a few pages each. This reference comes from a 19-page teaching explainer of about 110 steps, made by nine agents and reviewed in two rounds. Its first version was split well, but without shared names or rules for the register: most of the second round went into making nine agents' words agree, and a cold viewer ranked the drifting names as the top obstacle. The storyboard outline below puts those rules into the first version.

The coordinator writes the storyboard and the shared modules, dispatches the pages, settles inconsistencies between pages and runs the reviews. Each agent makes, checks and reports on its own pages. The author decides the claim and anything about the subject itself.

## 1. The storyboard comes first

One file at the project's root, `storyboard.md`, that every agent reads before it starts and again whenever it changes. Write sections A to G before any page is assigned; section H grows after each review (section 6). [Story](story.md) is the process behind the brief, the claim, the picture and the step tables; this is what the file must hold so that many agents make one piece.

**A. Brief.** The kind of piece; the audience and what they already know; what they understand before and after, as a numbered list the piece has to deliver; the author's requirements, verbatim and numbered, so agents can cite them. For a method, the opening order: one concrete case of a person doing the task, what makes it hard, the model and the one question it must answer, then the method (`presmium-author/references/writing.md`, section 2).

**B. Claim.** The thesis sentence and its ABT; the question the whole piece answers and the pages that answer each part of it. The narration of each of those pages points back to the question once.

**C. The central picture and the example.** One picture for the whole piece, at the same place and drawn the same way on every page that shows it, by a shared module (section 2): what each element is, how it changes, where each part sits, and where a part may be enlarged and returned to its place (the same object, never a copy faded in). One running example, all its data in that module: the fixed texts (a ticket, a quote) and every number. No agent invents data; a page that needs something the module lacks defines it in its own scene and labels it 示意 (illustrative).

**D. Names, colours and space.**

- **The term table**: every concept, its one name, the synonyms not to use, and the page that introduces it. Two roles that could be confused (the agent drafting the material and the agent under test) get two names, two colours and two icons.
- **The register**: titles, labels, legends, metric names and narration in the formal written words of the audience's field; only a character's quoted speech in a bubble keeps colloquial words. A metaphor system (a game, a court) is mapped term by term on one page; the other pages use the field's own words.
- **Colours**: one colour, one meaning, as a table of roles (truth, wrong, the user, the agent under test) each mapped to a design token in the shared kit, through `color(name)` or `var(--pm-color-<name>)`, never a raw hex.
- **Space**: one convention, such as left for upstream, input and before, right for downstream, output and after.

**E. Common rules**, short and numbered so reports can cite them:

1. Read first: this skill's `SKILL.md`, `lengths.md`, `story.md` (sections 4–6) and `libraries.md`; `presmium-author/references/writing.md`; one or two gallery pieces close to the page.
2. One idea per step; its rest frame reads alone in 3 seconds.
3. One thing moves at a time, the cause before the effect; an object that changes place or form moves or morphs, never fades out for a copy.
4. On screen only shapes, labels, keywords and numbers, with limits in characters (the explainer: a node label at most 4 汉字, a value at most 14, at most one new line of explanation a step). No narration sentence printed on screen.
5. Introduce, then name, then use: a concept first appears through motion that shows where it comes from and what it consists of; its name lands beside it after the motion; only then do labels, numbers and narration use it.
6. The method before its steps: what the method consists of, the rule each part is derived by and how it is checked, then the steps.
7. The names and register of D, in every label and every line of narration.
8. Narration: one or two short paragraphs a step, about 80 汉字 at most, saying what the picture can't show.
9. Durations: a step usually 3.5–6 s; a move the eye must follow 600–900 ms, an entrance 300–450 ms, a line drawn 400–600 ms; a result holds 1.5–2 s.
10. Any step in any order: the picture is a function of the step and the time only ([Libraries](libraries.md)).
11. The whole 16:9 frame is used; captions are an overlay that can be off, so no band is kept for them.
12. Colours only from D, type sizes only from the kit's scale.
13. The pitfalls in [Libraries](libraries.md), and every new one the coordinator forwards.

**F. Files and workflow**: who owns which file (section 2), how the document is changed (section 3), the checks, the captures and the report (section 4).

**G. Pages.** The page order, grouped into parts, with a page that maps out the parts before the first one. Per page: its key (also the scene file's name), a title that states the page's claim (with a length limit), the concepts it introduces, and a step table:

| Step | Rest frame and motion | Introduces (each new concept, and the motion that brings it in) | Narration points |
|---|---|---|---|

The owner designs the drawing and the motion, not what each step says or the order: a step may be split into two, never merged with another or moved.

**H. Conventions after review**, appended by the coordinator (section 6).

## 2. Shared modules and ownership

Pages read as one piece because they draw the same central picture, and that holds only when it is the same code. Before dispatching, the coordinator writes:

- `scenes/kit.ts`: the frame (16:9, sized in `cqw` and `cqh`, its CSS scoped to the scene), the type scale, the colour roles of D mapped to design tokens, and small helpers used everywhere (a chip naming a role in its colour);
- `scenes/<picture>.ts`: the central picture's geometry, functions that draw it whole or in parts, selector functions for animating its parts, coordinate functions (the centre of a slot, the edge of a node), and the example data of C.

Scenes import them with relative `.ts` imports ([Libraries](libraries.md), Rules for every library, shared modules). Ownership is by file:

- Each agent writes only its own `scenes/<key>.ts` and its own pages of the document. A helper it needs goes into its own scene file; a bug it finds in a shared module goes into its report.
- Only the coordinator changes shared modules. A change reaches every page that imports it: tell every agent what changed, and keep the old exports working until the pages have moved. When the explainer's board was enlarged to fill the frame, the pages that had computed slot positions themselves had to be redone; the pages that used the shared coordinate function moved with it.
- Every word a scene puts on screen sits in one object at the top of its file: renaming a term is one edit there, and the term sweep (section 6) reads one place per scene.

## 3. One document, many writers

There is one `lecture.json`, so writers must not overwrite each other.

- **One service.** Before dispatching, start `presmium studio` (or `presmium serve`) for the project; `presmium dev` won't do, since it offers neither author actions nor pictures. Every agent connects through the MCP server `presmium mcp`, which relays to that service. Agents never start, stop or restart it and don't run `presmium dev` or builds; the service compiles again when files change, so everyone sees everyone's current pages. Each write may wait for the author's approval in Presmium; whether a run of many agents may write without asking (`presmium serve --allow operate`) is the author's decision, not the agents'.
- **Author actions are transactions.** A page is created with `plan_page_change` and `apply_page_change`; its blocks, steps, narration and the definition of its scene with `plan_document_change` and `apply_document_change`, which can carry the page's scene file in the same change so that the definition and its code land together. A plan names the source version it was read from. When another agent saved in between, the apply returns 409: read again with `read_document_part`, plan again on the new version and apply that, never the old plan. Changes kept to one page at a time rarely collide.
- **Without the MCP server**, each page has its own description file (title, scene, static fallback, steps with their narration and duration) owned by its agent, and one script assembles them into `lecture.json` in the storyboard's page order: it writes a temporary file and renames it over the document, so no reader sees half a document, and it derives every ID from the page key and the step index, so assembling again keeps comments and steps attached. Anyone may run it at any time.

## 4. Each agent's loop

An agent goes through these after every change, on its own pages only:

1. **Check.** `check_document`, then `get_diagnostics`; fix the problems on these pages. A scene whose code doesn't bundle (a syntax error, a missing module) is reported by `check_document` and `presmium check` as a `presmium.preview.code` error with its file and line; it fails alone, so the other pages still preview and present, and its own page shows the failure (the capture's `problems` say why). Fix it before anything else.
2. **Look at every step.** `capture_slides` on each page returns every step's rest frame (12 pictures a call; name `steps` for a longer page). Each must read in 3 seconds, with nothing overlapping or cut off; `measure` with a CSS selector gives the boxes of elements when an overlap is hard to see. Capture again with `arrive: 'backward'` and compare: going back must show the same frame. When the reading page matters, `capture_reading` at 1280 and 390. Change and capture again until every frame passes.
3. **Check the motion.** Rest frames don't show it. Capture `at` moments inside the steps where something moves, and read the timeline: every move has a reason that means something (a cause, the same object, things converging); delete the moves that have none.
4. **Report** in this form: for each page, its number of steps and one line describing each rest frame; the picture files; the check result; problems found in shared modules; where the page departs from the storyboard and why; what isn't done or isn't good enough.

## 5. The coordinator during production

- Dispatch each agent with the storyboard's path, its pages and files, and the reading list of E.1.
- Read every report and look at its pictures. Settle a difference between pages (one part drawn two ways, one thing named two ways) at once: decide, write it into the storyboard, tell the agents concerned.
- Forward a pitfall one agent hit to every agent still working, at once; finding it nine times costs more.
- When every page is done, run the cold read (section 7) before the author sees the piece.

## 6. Review rounds

Each review, the cold read and then the author's, ends in a new section at the end of the storyboard (H1, H2, …) that says it takes precedence over everything above it. Then send every agent concerned the list of fixes for its own pages. Fixes go back to the agents that made the pages, which still have their context; a new page goes to a new agent with its step table. When a round reverses an earlier convention, edit the earlier entry to point at the new one: in the explainer one round said 观察, not 现象, a later term table mapped 观察 to 现象, and agents had to guess which held.

Decisions about the subject itself (a rule of the method, what counts as a cost) belong to the author: ask, don't settle them in a convention.

Before the author sees a round, sweep for terms: search the narration and text in `lecture.json` and the on-screen words in `scenes/*.ts` for every banned synonym in the term table, and for the colloquial words the register rules out. A hit is renamed, not explained.

What the explainer's two rounds had to add, usable as a checklist for the first version:

- **The picture**: the whole frame used; shared coordinate functions instead of computed positions; no text in a thumbnail too small to read (below about 12 px): enlarge it or keep only the outline.
- **Roles, colours and names**: confusable roles separated by name and colour; the colour table; a fixed text (the ticket) and the metric names taken from the shared constants; near-synonyms settled.
- **Facts stated one way everywhere**: each contradiction the cold read found, decided into one statement (what the agent under test can see, what the state holds, why a wrong conclusion can pass, where a language model takes part). A property that holds by design but hasn't been measured is said to be so.
- **One drawing per recurring part**: a gate that had been drawn three different ways became one barrier: closed dark, open green, refusing red with a shake.
- **The author's decisions**, the term table (before → after) and the table of page titles.
- **Rules decided in discussion**, written as content the pages must show, with a step table for any new page.

The lessons: the term table and the register belong in the first version (D), and "introduce, then name, then use" belongs in every step table, as its own column.

## 7. The cold read

A fresh agent that took no part sees only the pictures and the narration, in order, and reports what a first-time viewer gets. It finds what the makers can't see: contradictions between pages, one word with two meanings, names that drift, concepts used before they were introduced, elements nobody explained. In the explainer it found three problems that blocked the main line, more than twenty concepts left unclear and a dozen flaws in pictures, most of which the agents' own page-by-page checks had missed.

**When**: after every round of production or fixes, before the author reviews. A new reviewer each round: one that saw the last version already knows the answers.

**Prepare the material:**

1. `capture_overview` with `steps: 'all'`, `captions: false` and `images: false` takes every step of every page at rest, the whole slide without the captions over it, into one directory of the service's state, named so that sorted names are the playing order: `03-12-game.png` is page 3, step 12 (pages from 1, steps from 0, as the tools count them). Copy the directory at once: the service keeps only its latest captures. Without `steps: 'all'` it takes each page's last step, and its sheets of thumbnails show the whole piece at a glance.
2. A frame taken mid-motion gets reported as a flaw: these are rest frames, drawn from the step alone. Numbers in names must be zero-padded (the tool does it): with `15-1.png` and `15-10.png`, step 10 sorts right after step 1.
3. The same directory has `narration.md`, each picture's narration under its file name: the reader looks at whole slides and reads the script as text, instead of small captions over the picture.
4. Give nothing else: no source, storyboard, term table or notes, or the reader is no longer cold.

**First pass: understanding.** Replace the angle brackets; write the prompt in the document's language when the report should be in it.

```
You are seeing this explainer for the first time, as a viewer and a reviewer. You are <the audience, e.g. a researcher who evaluates LLM agents and knows incident troubleshooting, but hasn't seen this design>. You took no part in making it. Don't read any source code, storyboard or notes; use only the material below.

Material: <N> PNG pictures in <folder>, the rest frame of each step of the presentation. File names are <page number>-<step number>-<page key>.png (steps from 0), and their sorted order is the playing order. <folder>/narration.md has each picture's narration under its file name: read it with the picture, as a viewer hears it. Look at every picture in order with the Read tool; skip none.

First, page by page. After each page (all pictures with the same page number), write:
- what the page says, in one sentence of your own;
- every concept, shape or label that first appears here and that you don't understand, or that is used before it was introduced (the step, and where in the picture);
- problems in the pictures: overlapping text or text too small to read, elements whose meaning is unclear, a colour whose meaning changes, a contradiction with the narration (the step, and where);
- before you look at the next page, predict what it will say; after it, note whether you were right.

At the end:
- the claim of the whole piece in your own words, in three to five sentences: the problem, the method, why the method solves it;
- the steps of <the core process, e.g. how one task becomes a state machine>;
- what you still don't understand;
- the problems to fix, the most serious first: P0 (blocks the main line), P1 (leaves one concept unclear), P2 (a flaw in a picture). Write each as "file · where · problem → suggested change".

Change no files. Be specific; don't praise what works.
```

**Second pass: names and register**, sent to the same reviewer once the first report is in, because wording is a cost of understanding too:

```
Check the wording once more, still changing no files:
1. Names: which things are called by several names on different pages? Which word means different things on different pages? List each, with where.
2. Field terms: which words would <the audience's field, e.g. an operations engineer> not use day to day? Are several metaphor systems mixed (a game's, a court's, Kubernetes')? Give a table that replaces them with the field's everyday words.
3. Register: which titles, labels, legends, metric names and lines of narration are colloquial? Give a table of formal replacements. A character's quoted speech in a bubble may stay colloquial; leave it out.
4. In Chinese narration, is a person referred to as 它?
Add these to the problem list as P0, P1 or P2.
```

**Use the report:**

1. A P0 is usually a contradiction or a role ambiguity: decide one statement for the whole piece, write it into the storyboard (H) and send it to the pages concerned.
2. A problem with the method itself, such as a rule whose reason no longer holds, goes to the author; don't decide it.
3. The wording problems become one term table in the storyboard, which every page follows.
4. Fixes go to the agents that made the pages.
5. After the fixes, capture everything again and give it to a new reviewer.
