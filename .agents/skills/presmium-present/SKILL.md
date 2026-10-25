---
name: presmium-present
description: "Help a teacher present and teach with a Presmium document: present it with a presenter window, give students a link to follow, run quizzes and questions in a classroom, prepare an offline class, export PDF, images, PowerPoint or a notebook, and record, synthesize, replay and export a narrated lecture video. Use when presenting or teaching with a Presmium document, handing out its outputs, running a classroom, or recording and replaying a lecture. 放映、上课、课堂互动、离线授课、导出 PDF 或视频、录课与回放时使用。"
---

# Presenting, teaching and handing out

This skill takes a teacher from a finished Presmium document to a class: presenting it, letting students follow and answer, handing out files, and making a narrated lecture video. Writing or fixing the content itself is the `presmium-author` skill.

## Words used here

- **Document**: what the teacher wrote, a folder with `lecture.md` (plus its `scenes/`, `components/` and media). Run every `presmium` command in this folder; where the command help says `[deck]`, it means this document folder (default: the current folder).
- **Frontmatter**: the YAML block between `---` lines at the top of `lecture.md`. Settings in this skill go there.
- **Section**: the part of the document under one `##` heading; it is one slide when presented. **Step**: a position inside a section; pressing next moves one step.
- **On-screen content**: what the slide shows. **Narration**: the plain paragraphs of the document, which are the speaker notes and what a lecture says.
- **Form**: what the document is built into: the web page (`web`), the slides (`slides`), the notebook (`notebook`) and the lecture (`lecture`). The frontmatter key `renderers` lists the forms a build makes, each with its options; `--to web,slides` picks forms for one command.
- **Lecture**: the narrated playback: the narration recorded by the teacher or synthesized by a speech engine, played over the presentation, and the video exported from it. One recorded or synthesized lecture is a **track** with an id.
- **Studio**: the browser workbench started by `presmium studio`.
- **Plugin**: an npm package that adds features. Several features below need one. To add it, install it in the project and list it in the frontmatter, then restart `presmium dev` or rebuild:

  ```sh
  pnpm add -D @lincyaw/addon-stage
  ```

  ```yaml
  plugins:
    - '@lincyaw/addon-stage'
  ```

| Plugin | Gives |
|---|---|
| `@lincyaw/addon-stage` | Black out, freeze and the pen while presenting |
| `@lincyaw/addon-guide` | Spotlight and hint while presenting, and pointers in a lecture |
| `@lincyaw/addon-session` | The classroom: students join and follow |
| `@lincyaw/addon-classroom` | Quizzes, polls and questions in the classroom |
| `@lincyaw/addon-exec` | Running and checking code exercises |
| `@lincyaw/addon-assistant` | AI answers to students' questions |
| `@lincyaw/addon-publish` | `presmium-export` (PDF, images, PowerPoint) and the "Save for offline use" button |
| `@lincyaw/addon-lecture` | Recording, replaying and exporting a lecture |
| `@lincyaw/addon-speech` | Synthesizing a lecture from the narration |

Before changing anything, read the document's frontmatter (`plugins`, `renderers`), its `package.json` scripts and any existing `dist/` output, and keep the forms and the hosting the teacher already uses.

## What does the teacher want to do?

| The teacher wants to | Do | Read |
|---|---|---|
| Present now, on this computer | `presmium dev --to web`, then the Present view and the presenter window | "Start presenting" below |
| Give students a web address or files to study from | Build a static site (all of it, or the student version) and serve or upload it; or build a notebook | [references/delivery.md](references/delivery.md) |
| Have students scan a code to follow, answer quizzes and ask questions | Build the student site, run a separate classroom server, create a classroom while presenting | [references/classroom.md](references/classroom.md) |
| Export a PDF, one page per step, images or PowerPoint | `pnpm exec presmium-export` (publish plugin), then open the file and check it | [references/delivery.md](references/delivery.md), "Export a PDF, images or PowerPoint" |
| Teach without a network | Open the built site while online, fetch what runs code, then rehearse disconnected | [references/delivery.md](references/delivery.md), "Prepare an offline class" |
| Record a class, synthesize a lecture from the narration, publish a replay or a video | Record in the Present view, or set a voice and build the lecture form; export with `pnpm exec presmium-lecture export` | [references/lecture.md](references/lecture.md) |

Read only the reference for the chosen task.

## Start presenting

1. In the document folder run `presmium dev --to web`. It prints the web address of the page; open it. The document appears as a page you can scroll.
2. Open the **View** menu in the navigation bar and choose **Present**. The page now shows one section at a time, as a slide, with its on-screen content and without the narration. (Adding `?view=present` to the address opens it in Present directly.)
3. Click **Full screen** in the bottom bar, and move this window to the projector.
4. Press `p` (or the **Presenter window** button) to open the presenter window; allow the popup if the browser blocks it. Keep it on your own screen: it shows the current step's narration, the next step, a timer and, with a classroom, the classroom panel.
5. Press `→` in either window. Both windows should move together. They stay in sync only when they are in the same browser at the same address origin.

The View menu has three views: **Document** for reading, **Scrollytelling**, which advances the on-screen content as the reader scrolls through the narration, and **Present**. In the studio, open the document and use its presentation control; video files are made from **Export**.

| Key in Present | Does |
|---|---|
| `→`, `↓`, `PageDown`, Space | Next step; after the last step of a section, the next section |
| `←`, `↑`, `PageUp`, `Backspace` | Previous step |
| `Home`, `End` | First section, last section |
| `o` | Overview of all sections; move to one and press `Enter` to go there; `o` or `Esc` closes it |
| `p` | Open the presenter window |
| `Esc` | Leave Present (not in the slides form, which is always Present) |
| `b`, `f` | Black out or freeze the audience screen; press again to restore (stage plugin) |
| `d` | Pen: draw on the slide; press again to put it away (stage plugin) |
| `s`, `h` | Spotlight or hint the block under the pointer (guide plugin) |

When `b`, `f`, `d`, `s` or `h` does nothing, the plugin is missing: add it as above and restart.

**Returning to a place.** While presenting, the address bar keeps the position, `?view=present&section=<section id>&step=<step>`, so reloading the page returns to the same place, and you can bookmark it. `?view=present&slide=<number>` (counting from 1) also works. The presenter window is the same address with `view=presenter`.

**The slides form.** A document can also be built as a separate slides page (`presmium dev --to slides`, or `presmium build --to web,slides`; see [references/delivery.md](references/delivery.md)). Open the address the command prints: that page is always the Present view, with the keys above, and its presenter window is the same address with `?view=presenter`.

**Pen and drawings.** With the stage plugin, the pen (`d`, or the pen in the control bar) has four inks, an eraser, undo and clear. Drawings appear in the presenter window, the audience window and, during a class, on students' screens. When the page comes from `presmium dev` or `presmium serve`, drawings are saved in the document's `.presmium/drawings/` and come back next time; a static site does not save them.

## Rehearse what this class will use

Check only what this class uses, in the real setting, and tell the teacher which outside conditions (projector, room network, student devices) you could not check:

- **Presenting**: forward and back in the audience window; the presenter window follows and shows the right narration; long code is readable at projector size; the **Run** buttons on code, recorded outputs, sound and video work.
- **Classroom**: join from another browser or a student phone; the student follows the presenter; answer one quiz; reveal its result ([references/classroom.md](references/classroom.md)).
- **Offline**: disconnect the network and go through the class in the same browser and address ([references/delivery.md](references/delivery.md)).
- **Student version**: open the student build and look for teacher narration, answers and media that should not be there.
- **PDF**: open the file; check the page count, missing pages, code running off the page and the key links.

## Which address students get

`presmium dev`, `presmium serve` and `presmium studio` are the teacher's own working services. They serve the whole document, including teacher-only content, and have no student view. `presmium serve --host 0.0.0.0` (or `presmium studio --host <address>`) opens the service to the local network with no login: anyone who reaches the port can edit the document as the teacher. Never hand out these addresses, or any token they print, as a student link.

For students, build a static site with `presmium build --to web --audience student --out dist-student` and serve `dist-student/web` ([references/delivery.md](references/delivery.md)); for a class with live interaction, connect it to a separate `presmium-classroom-server` ([references/classroom.md](references/classroom.md)). To publish the whole document instead, build without `--audience`.

## When something goes wrong in class

| Symptom | Check first |
|---|---|
| Students cannot open the link | Student devices can reach both the site and the classroom server; the link and the frontmatter's classroom `server` use the computer's network address, not `localhost` or `127.0.0.1` |
| The presenter window does not follow | Both windows in the same browser, at the same origin; the popup was allowed |
| White page or 404 after rebuilding a static site | Restart the static server (it keeps the old file list); then check that the form's `base` in `renderers` matches the path the site is served at |
| No **Classroom** in the navigation bar, no **Record** or play button in Present | The plugin is installed and listed in `plugins`; recording needs `presmium dev` or `presmium serve`, not a static site |
| Pages open offline but code does not run | The code runtimes were fetched while online ("Save for offline use", or running the code once); remote Jupyter, the classroom and AI models always need the network |

When content or steps are wrong, switch to `presmium-author`. When you hand over, tell the teacher: the address or file to open, which address the teacher uses and which the students use, and what must be rebuilt or prepared again before the next class.
