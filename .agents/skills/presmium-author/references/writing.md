# Writing a teaching document

One `lecture.json` gives every page two versions:

- the **reading version** (the web page, and the notebook when the document lists it) is read by someone alone, with nobody to explain it. It is written like a book;
- the **presentation version** (the slides, and the narrated lecture video made from them) is watched while a speaker or a voice explains it. It shows keywords, pictures and motion, and the explanation is spoken.

The two versions share the page order, the headings, the figures, the code, the formulas and the animations. They differ in their words. This guide covers what both have to get right (sections 1 and 2), how one page carries both versions (section 3), each version's own rules (sections 4 to 6) and the review before handing the document over (section 7). The format of the entities named here is in [Document format](document.md); building an animation is `presmium-animate`.

## 1. Before writing

Write these down before the first page. When the request doesn't give the audience or the forms, ask the author once, in one message, before planning pages; for everything else, state your assumptions in one line and continue.

- **Audience**: who reads or watches, and what they already know. A term the audience doesn't know gets defined at its first use; a term they know is used without comment.
- **Core claim**: the one sentence the audience should understand at the end, with its reason: "读完后，读者明白 X，因为看到了 Y". A topic ("讲讲缓存") is not a claim; "第二次取同一本书只要伸手到桌上，所以缓存让重复读取变快" is.
- **Forms that matter**: which of the reading page, the slides and the lecture video the author will actually hand out (`metadata.renderers` lists what the document builds: `web`, `notebook`, `slides`, `lecture`). Write the versions that are used; don't fill in a version nobody will see.
- **One idea per page**: list the pages as one sentence each before writing any of them. If a page needs two sentences, it is two pages.

## 2. The information principle

Every sentence, label, example, figure and page has a reason to exist: it changes what the audience understands, how they judge something, or what they can do. Content whose removal changes none of these is deleted. Layout, narrative and polish serve this rule and never override it. This applies to both versions.

### Organize around the claim

- **Order by how the audience comes to understand**, not by how the work was done, what was tried first or the history of the field. The reader needs the current state; how it was reached stays out unless the path itself is the lesson.
- **Open with what matters**: the first page states the question the audience cares about and the core claim; the first concrete example or the strongest evidence follows right after, not after a long background.
- **End by reinforcing**: the last page restates the core claim and what is most worth remembering. It doesn't change position, add caveats or end on a general moral.
- **State why it matters**: say what the claim rests on and what it lets the audience understand or solve. Don't leave the reader to infer the value from a table or a figure.
- **Compare by goals**: when methods or views differ, explain the difference through what each is for, its conditions and its trade-off ("X 用内存换速度，数据小时更合适"), not through a verdict of better or worse.
- **No self-undermining**: no "只是一些浅见", "可能没什么价值", "unfortunately", "merely". A scope limit is stated once, plainly, where it applies.

### Cut sentences that carry nothing

Search the draft for these markers. Most hits are deleted or rewritten; keep a hit only when the test below says the reader needs it.

| Pattern | Markers | Repair |
|---|---|---|
| Defending against a misreading nobody had | 不代表、不意味着、并不是说、不等于; this does not mean, we do not claim | Delete. If the earlier claim really invites the misreading, narrow that claim instead |
| Strawman contrast | 不是 A 而是 B、并非 A 而是 B; not A but B | When nobody holds A, state B directly. When A is a real, common belief, keep it and say whose belief it is |
| Narrated history | 起初、后来发现、我们首先尝试; initially, we first tried | Keep only the result |
| Signpost | 值得注意的是、需要指出的是、不难看出; it is worth noting, note that | Delete the signpost and state the thing |
| Meaning stamp | 综上所述、这体现了……的重要性、为……奠定了基础; in summary, this highlights | Delete when it repeats the topic; otherwise write the conclusion it hints at |
| Empty intensifier | 本质上、显然、事实上; fundamentally, clearly, in fact | Delete unless the claim is surprising |
| Pointer without a claim | 如图所示、结果见表 3; as shown in the figure | Write what the figure shows, with its number, and attach the figure to that sentence |
| General praise | 高效、强大、灵活、无缝; powerful, seamless, robust | Write the specific property and its number, or delete |

The test for each hit: **would a reader who has read everything up to here plausibly believe what this sentence answers?** If not, the sentence answers a question nobody asked: delete it. Negations that state an advantage ("无需标注", "no retraining") or a condition in a definition are information; keep them.

### Choose the medium

When a paragraph has been rewritten three times and still reads heavy, it belongs in another medium: a comparison of three things is a table, a system of parts is a diagram, a process is an animation or a numbered list, a relation between quantities is a formula or a chart. Stop polishing prose in the wrong medium.

## 3. One page, two versions

Each piece of content goes to the version that needs it. Blocks carry `only`, a list of the forms (renderer ids) that show them; a block without `only` appears in every form.

| Content | Reading | Presentation | Where it lives |
|---|---|---|---|
| Heading, figure, animation, code, formula, table | ✓ | ✓ | An ordinary block, no `only` |
| Explanatory paragraphs | ✓ | | A text block with `only: ["web", "notebook"]` (`["web"]` when the document has no notebook) |
| Keywords and short labels for the screen | | ✓ | A text block with `only: ["slides", "lecture"]` |
| The spoken explanation | | ✓ (heard) | The step's narration (`narrations`, named by `narrationIds`) |

- **Share the picture, split the words.** The figure or animation is the page's argument and appears in both versions. The reading version explains it in paragraphs; the presentation version labels it with a few words and explains it aloud.
- **Narration is the presentation's explanation.** It is spoken in the lecture video, read by a presenter from the Presenter View, and becomes the speaker notes of an exported PowerPoint. It is never shown on the reading page, so the reading version must not depend on it.
- **Steps follow the shared content.** Drive steps with the figure, the animation or blocks both versions show, and attach the form-limited text to those same steps. A step that only reveals form-limited content is dropped from the other forms: if step 2 of a page only shows slide keywords, that page has one step fewer on the reading page, and the two versions no longer step together.
- **Name both presentation forms.** The lecture video uses its own `lecture` view, so a block limited to `["slides"]` is left out of the video; write `["slides", "lecture"]` for text the video should show too.
- **Check both versions**: preview the reading page and the presentation of every page you changed (section 7). A page whose reading version is a list of keywords, or whose slide is a wall of paragraphs, put its words in the wrong blocks.

When the author writes only one version (a handout with no slides, or a talk with no reading page), skip `only` and write that version by its own rules below.

## 4. The reading version

The reading version is a book chapter. A reader alone must understand it without the slides, the narration or a teacher.

### Register

- **Written language, formal wording.** Write as a textbook does: complete sentences, exact terms, no chat, no filler, no exclamation marks, no emoji, no rhetorical questions that the next sentence answers.
- **Chinese is written in Chinese order** (书面中文). Put the topic first and the comment after it ("协调进程在扫描期间一直持有这把锁", not "这把锁在扫描期间被协调进程持有"). Turn a stack of 的-modifiers into a predicate ("这个模块处理用户提交、还没通过校验的请求", not "一个用于处理由用户提交的且尚未通过校验的请求的模块"). Avoid English structures in Chinese words:

  | Translationese | Write |
  |---|---|
  | 对 X 进行了优化、执行一个操作 | 优化了 X、use the verb itself (提交、重启、校验) |
  | 通过……的方式、基于 X 的方法 | 用……、X 方法 |
  | 使得……成为可能、提供了……的可能性 | 让……、可以 |
  | 在本节中，我们将讨论 | Delete it and start |
  | 一个 (for "a"), ……们 on things, 被 for every passive | Usually delete; prefer the active voice |
  | 不仅……更是……、在……的时代、让我们一起…… | State the fact once |
  | Four-character stacks (高效稳定、灵活强大) | The specific property |

- **English is written in English order.** Use the subject–verb–object order and idiom of an English textbook; don't carry Chinese topic chains or 的-stacks into English. Prefer active verbs and concrete subjects.
- **Punctuation**: Chinese uses full-width punctuation throughout and 顿号（、）between coordinate items. Neither language uses the dash (—, –) as sentence punctuation: split the sentence, use a colon or parentheses, or delete the aside.
- **One term, one word.** Give a term once with its translation if needed, "缓存（cache）", then keep one form. Identifiers (commands, field names, function names) stay verbatim in code formatting and are never translated.

### Paragraphs

- **Topic sentence first.** Each paragraph opens with its claim; the rest supports it. A reader skimming the first sentences gets the argument.
- **Concrete before abstract.** One case, one request, one number before the general rule; the formula comes after the picture it labels.
- **Define at first use**, once, and introduce few new terms per page.
- **Vary sentence length** and keep reasoning in paragraphs. Bullet lists are for items that are truly parallel; a chain of causes flattened into bullets loses the chain.
- **Let the page wrap the text.** No manual line breaks, padding spaces or shortened words to fix a short last line; a break that suits one width breaks another.

## 5. The presentation version

The slide supports a voice; it doesn't replace it. The audience reads the screen and listens at once, so the screen carries what the voice can't: the picture, the structure and a few words.

- **Little text.** A heading that states the page's point, then keywords: short labels beside the part of the picture they name, a number with its unit, a formula's named terms. No paragraphs, no full sentences repeating the narration. Text on screen that duplicates the narration makes it harder to follow than the narration alone.
- **Graphics first.** When a slide holds more text than a few labels, turn the relation into a picture: a flow for a process, a diagram for parts, a timeline for order, a chart for numbers, an animation for change (`presmium-animate`). Graphics carry information and show relations; a paragraph inside a box is still a paragraph.
- **Reveal with the voice.** Use steps so each part appears when the narration reaches it, not everything at once on the first beat. One teaching state per step; a reveal binds the explicit IDs of the list items or blocks it shows, never their positions. Narration plays in the order of the step's `narrationIds`.
- **Vary the arrangement.** The arrangement is how a slide's content is organized: a flow, a comparison, a timeline, a chart, a figure with labels, a code walkthrough, a single statement. (It is not the page's `layout` field, which has only four values.) Two consecutive slides don't share an arrangement, and no arrangement appears twice within five consecutive slides. When one repeats, reorganize the content by its relation; changing colours or icons doesn't make it a different arrangement.
- **The heading is a claim.** "缓存命中率" names a topic; "命中率超过 90% 后，加内存几乎不再变快" is the slide's point.
- **Numbers and sources stay honest.** Numbers come from the real run or the cited source. An illustrative value carries a label beside it in the document's language (示意 / illustrative), an estimate likewise (估算 / estimate).

## 6. The narration

Narration is a separate script for the ear, written for the presentation version. It is not the reading paragraphs read aloud: the reading version is written for the eye and is too dense to follow by listening.

- **Spoken register, still correct.** Shorter sentences than the reading version, one idea each, the subject near the verb, everyday connectives (所以、可是、接下来). It remains standard Chinese or English: no filler words, no translationese, no chatty asides.
- **Say what the picture can't show**: the cause, the size, the consequence. Never narrate what is visible ("如图所示，红点越来越多"); say the rule behind it ("一个人传三个，三个传九个").
- **No pointing at nothing.** "这里"、"如图"、"看这个" only when the step reveals or highlights that thing at that moment. A cue (a node inside the narration that triggers an action, such as pointing at a block, when the voice reaches it) can do the pointing.
- **Budget by time.** A step usually speaks for 6 to 15 seconds: about 20 to 50 汉字 in Chinese (3.5 a second, pauses included) or 15 to 40 words in English (2.5 a second); measure the chosen voice afterwards. A step lasts as long as its narration, so a long script stretches the step while the picture stands still: split the step or trim the script.
- **Write for the voice.** Spell out what a synthesized voice can misread: numbers with units ("百分之九十"), symbols, abbreviations and English terms inside Chinese. A word that must be shown one way in the captions and spoken another uses a pronunciation node in the narration (`pronunciation { display, spoken }`) instead of changing the visible text.
- **Questions turn the talk**: "那如果数组已经排好了呢？" before a turn, with a short pause after it.
- **Wording can differ, the claim can't.** Narration may order, simplify and repeat differently from the reading version, but it states the same facts and numbers. When one changes, check the other.

Generating voiceover from narration, choosing voices and producing the video are in [Lecture production](lecture.md). Changing narration text never generates audio by itself.

## 7. Review before handing over

Review from the seat of someone who hasn't seen the document, not from the seat of the writer.

1. **Read the reading version alone**, start to end, in the reading preview, with the slides and narration out of mind. Mark every place where a term is undefined, a step of reasoning is missing or a sentence depends on something said only in the narration.
2. **Watch the presentation with the sound off**: each slide should show its point through the heading and the picture. Then **listen without looking**: the narration should not rely on "这里" or "如图" pointing at nothing.
3. **Sweep both versions** with the marker table of section 2, and for Chinese, the translationese table of section 4.
4. **Check the structure**: one idea per page, the core claim on the first page and again on the last, and the arrangement rule of section 5 (no two consecutive slides alike, no repeat within five).
5. **Ask a fresh reader** (a person, or a subagent given only the built output) to retell the core claim in their own words and to predict what the next page shows. "Clear" is not a pass; a correct retelling is.
6. **Validate and preview**: `presmium check <document>`, then the reading page and the presentation of the changed pages. Labels and code must be visible, steps reversible and every page's final step complete.

Keep IDs when revising: comments, steps and narration stay attached to their blocks. See [Document format](document.md) for the entities and [Publishing](publishing.md) for the outputs.
