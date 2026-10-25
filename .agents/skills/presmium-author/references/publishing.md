# Publishing and reproduction

Read this to deliver a document to students, publish a course site, add a translation, or let someone check out the source and reproduce the results. Settle what is delivered first, then build the matching output.

## Content for students

Content can be marked for an audience, such as `teacher`; a build for another audience leaves it out. Content without a mark is for everyone.

- A block written as a directive: add the option `:audience: teacher`.
- Narration (plain paragraphs take no options): wrap it in `{only}` with the forms it should appear in, and put the audience on that:

  ```md
  :::{only} web, slides, notebook
  :audience: teacher
  First draw the two branches on the whiteboard.
  :::
  ```

- A whole section: put `:::{audience} teacher` (with an empty body, closed by `:::`) at the top of the section.
- A whole included file: put `:audience: teacher` on its `{include}`. Headings in the included file still start sections, and those sections are only for that audience. Text written after the `{include}` without a new heading may still belong to the last included section; start a new section with a heading after it, and read the related check messages.

The details are under `{audience}` and the common options in the [directive reference](directives.md).

Build the student version from the document folder into a separate output folder, so nothing from an earlier full build gets mixed in:

```sh
presmium check --audience student
presmium build --audience student --out dist-student
```

The build then scans every file it writes for sentences of the removed content, in case they came back through code output or other files. Such a leak is reported with the diagnostic id `presmium.audience`; trace it to the source and fix the marking or the output. Hiding page elements is not a fix. Open the student output yourself and check for teacher narration, answers and media.

`presmium serve` and `presmium dev` always serve the full content; they do not filter by audience. Share the address of the student output's static site; classroom interaction needs a separate classroom service, see the presmium-present skill.

## Links and files published with the output

Plain links and images are relative to the source file that contains them; a path starting with `/` points into the document's `public/` folder. Linked files are published with the output. Code anchors, by contrast, are relative to the git repository root (see [Code references and execution](code.md)). Do not switch to absolute local paths because the two rules got mixed up.

A link to a folder publishes only its regular files; hidden folders and `node_modules` are not published. A direct link to a single file publishes it even when it is hidden, so never link to credential files. Files outside the document's repository are not published.

`presmium check` checks local links and their `#` fragments. To check external links too, run `presmium check --external-links`, which needs lychee installed on the machine. To make sure internal words or ids are never published, list them as JavaScript regular expressions under `checks.forbid` in the frontmatter; a match in any form is reported. This does not replace audience marks.

## Adding a translation

In the original's frontmatter write `translations: { en: lecture.en.md }` (language, then the translation's entry file). In the translation's frontmatter write its title, language and source:

```yaml
title: Tokenization
lang: en
translationOf:
  entry: lecture.md
  digest: '<the digest that presmium check reports>'
```

A translation uses the original's plugins and form settings. Give its sections the same labels (`(name)=`) as the original, so that switching language stays at the same place. After translating, run `presmium check`, review the content, and copy the 64-character digest from the check's message into `digest`. When the original changes, the check warns that the translation is out of date and gives the new digest: update the translation first, then the digest.

Only the web page is published in several languages; the slides and the notebook are built from the original only. The workspace preview of `presmium serve` currently shows only the original, so build to verify a translation. A student build filters and scans the translations too.

## Combining documents into a course

A workspace is a folder with `presmium.workspace.yaml` that holds several documents. Run `presmium build` at its root to get the whole site in `dist/web/`; running it in a document folder builds that document only. A workspace should have its own git repository.

Link between documents by pointing at the other document's entry file, for example `../week2/lecture.md#merge` (`#merge` is a section label). A workspace build turns these links into links to the matching pages. A build of a single document does not publish the other document, and the diagnostic `presmium.links` says so.

In `presmium.workspace.yaml`, under `site:`, set `base` to match the deployment address (for example the sub-path of a project site), and set the navigation (`nav`), footer (`footer`) and home page as needed; do not add settings the user did not ask for. After publishing, open the home page, follow the links between documents and try the language switch.

## What others need to reproduce the results

Commit these with the source, all under `.presmium/` in the document folder:

- `freeze/`: the recorded output of code runs.
- `anchors.lock.json`: the resolved code anchors.
- `assets/`: local copies of the remote images and media the document uses.
- `drawings/`: the presenter's pen drawings on the slides.
- With a synthesized lecture, also `speech/` and `speech.lock.json`, so other people's builds do not call the speech service again.

A recorded lecture's `lectures/<id>/track.json` records the actions and their timing. Its audio and video are ignored by git by default, so committing only the track carries neither the voice nor the recording; store the media separately or with Git LFS, as the project prefers.

`dist/` and the working folders `.presmium/web`, `.presmium/slides`, `.presmium/dev` and the like are not source; they are rebuilt. Check the project's ignore rules; do not commit all of `.presmium/`. Serving a site, PDF export and offline delivery are in the presmium-present skill.
