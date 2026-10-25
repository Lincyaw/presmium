# Publishing and reproduction

Use this to deliver to students, publish a course site, add a translation, or let someone check out the source and reproduce the results. Settle what is delivered first, then build the matching output.

## Content for students

Mark teacher-only blocks with `:audience: teacher` on the directive; wrap narration in `{only}` to give it an audience. For a whole section use `{audience} teacher` at the top of the section; for a whole included file put the audience on `{include}`. The syntax is under `{audience}` in the [directive reference](directives.md).

Build from the lecture directory into a separate directory, so nothing from an earlier full build gets mixed in:

```sh
presmium check --audience student
presmium build --audience student --out dist-student
```

The build scans whether removed content came back into the student version through output or other files. When `presmium.audience` appears, trace the source and fix the marking or the output; hiding page elements is not a fix. Open the student output and check for teacher narration, answers and media.

`presmium serve` and `presmium dev` serve the full lecture; they do not filter by reader. Share the static address of the student output; classroom interaction needs a separate classroom service, see `presmium-present`.

When an `{include}` with an audience brings in a new section, the content after it may still belong to that section. Start a new section with a heading after it, and read the related check messages.

## Links and files published with the output

Plain links and images are relative to the source file that contains them; `/...` means the lecture's `public/` directory. Linked files are published with the output. Code anchors, by contrast, are relative to the git root. Do not switch to absolute local paths because the two rules got mixed up.

A link to a directory publishes only its regular files; hidden directories and `node_modules` are not published. A direct link to a single file can still publish a hidden file, so never link to credential files. Files outside the lecture's repository are not published.

Cross-document links in a workspace point at the other document's entry, e.g. `../week2/lecture.md#merge`. A workspace build turns them into the matching pages; a build of a single lecture does not publish the other one, and `presmium.links` says so.

`presmium check` checks local links and fragments. To check external links use `presmium check --external-links`, which needs lychee installed on the machine. `checks.forbid` (a list of JavaScript regular expressions in the frontmatter) reports internal words or IDs that must not be published, in every medium; it does not replace audience marking.

## Adding a translation

In the original's frontmatter write `translations: { en: lecture.en.md }`. In the translation's frontmatter write the title, language and source:

```yaml
title: Tokenization
lang: en
translationOf:
  entry: lecture.md
  digest: '<the digest that presmium check reports>'
```

A translation reuses the original's plugins and renderer configuration. Give its sections the same explicit labels as the original so switching language stays at the same place. After translating, run `presmium check`, review the content, and fill in the 64-character digest from the message. When the original changes, review the translation first, then update the digest.

The web build publishes translations; slides and notebooks have the original only. The workspace preview of `presmium serve` currently shows only the original, so build to verify a translation. A student build filters and scans translations too.

## Combining lectures into a course

Run `presmium build` at the root of a workspace (the directory containing `presmium.workspace.yaml`) to get the whole site in `dist/web/`; running it in a document directory builds that document only. A workspace should have its own git repository.

Keep links between documents pointing at the source entries. Set `site.base` to match the deployment address, for example the sub-path of a project site; set navigation, footer and home page as needed, and do not add settings the user did not ask for. After publishing, verify the home page, the cross-document links and the language switch.

## What others need to reproduce the results

Keep with the source `.presmium/freeze/` (execution recordings), `.presmium/anchors.lock.json` (anchors), `.presmium/assets/` (localized assets) and `.presmium/drawings/` (pen annotations). With a synthesized lecture also keep `.presmium/speech/` and `.presmium/speech.lock.json`, so other people's builds do not call the speech service again.

A recorded lecture's `lectures/<id>/track.json` records the actions and their timing; audio and video are ignored by default, so committing only the track does not carry the voice and the recording. Store the media separately or use LFS as the project prefers.

`dist/` and the working directories `.presmium/web`, `slides`, `dev` and the like are not source for reproduction. Check the project's ignore rules; do not commit all of `.presmium/`. Starting a site, PDF and offline delivery are in `presmium-present`.
