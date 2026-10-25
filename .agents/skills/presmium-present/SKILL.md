---
name: presmium-present
description: "Help a presenter present and teach with a Presmium lecture: project it with a presenter window, give students a link to follow, answer quizzes and ask questions in a classroom, prepare an offline class, export PDF, images, PowerPoint, a notebook or a lecture video, and record, replay and revise a lecture. Use when presenting or teaching with a Presmium lecture, distributing its outputs, running a classroom, or recording and replaying a talk. 放映、上课、课堂互动、离线授课、导出 PDF 或视频、录课与回放时使用。"
---

# Presenting, teaching and delivery

Start from what the presenter and the students will actually do, and prepare content that opens and works. First tell apart the presenter's own preview, the projected screen and the version the students get; then choose how to start and publish.

## Act on what this session must achieve

| The user's goal | Default approach | Details |
|---|---|---|
| Project and present right now | The web Present view plus the presenter window; reuse slides if the deck already has them | "Start presenting" below |
| Give the lecture to students, for self-study, or deploy a site | Build the agreed version and deliver a static site or a notebook | [Publishing, export and offline](references/delivery.md) |
| Teach without a network | Load the pages and the execution runtimes in advance, then rehearse offline | [Publishing, export and offline](references/delivery.md) |
| Students scan a code to follow, answer and ask | Prepare the student site and a separate classroom server, then walk the student path | [Classroom](references/classroom.md) |
| Export a PDF, or one page per step | Use `presmium-export`; check the actual pages and links | [Publishing, export and offline](references/delivery.md) |
| Record, publish a replay, synthesize speech or export a video | Record in the web Present view, or synthesize the lecture, then build the replay | [Recording and replay](references/lecture.md) |

Look first at the existing deck's frontmatter, build scripts and outputs, and keep the forms and the deployment the user already has. Read only the reference for the chosen task.

## Start presenting

To edit and present on this machine, run `presmium dev --to web` in the deck directory and open the web address the command prints. To start a version already built for distribution, serve it with a static server as in [Publishing, export and offline](references/delivery.md).

The View menu in the web navigation bar offers Document, Scrollytelling and Present: Document is for reading, Scrollytelling advances as the reader scrolls through the narration, and Present shows the projected content section by section and step by step. To open straight in Present, add `?view=present` to the web address. The workbench keeps only Document and Present: the slides are shown in Present, a lecture's playback controls appear there when the lecture is configured, and video files are made from Export.

| Key in Present | Purpose |
|---|---|
| `→`, `↓`, `PageDown`, Space | Next step; after the last step of a section, the next section |
| `←`, `↑`, `PageUp`, `Backspace` | Previous step |
| `o` | Overview; pick a slide and press `Enter` to go there |
| `p` | Open the presenter window |
| `Esc` | Leave Present |
| `b`, `f` | Black out or freeze the audience screen; press again to restore. Needs the stage plugin |
| `d` | Pen: draw on the slide; press again to put it away. Needs the stage plugin |
| `s`, `h` | Spotlight or hint the block under the pointer. Needs the guide plugin |

Use the Full screen button in the bottom bar. Put the Present window on the projector and keep the presenter window on your own screen; it shows the current step's narration, a preview of the next step, a timer and the classroom panel. The two windows stay in sync when they are in the same browser and the same origin; allow the popup if the browser blocks it.

Black out, freeze and the pen need `@lincyaw/addon-stage` listed in the frontmatter; spotlight and hint need `@lincyaw/addon-guide`. When a feature is missing, check the plugins first, then rebuild.

Position and recovery: the web address accepts `?view=present&section=<section id>&step=<step>`; the presenter window uses `view=presenter`. The address follows the position while presenting, so a reload returns to the same place.

When the user presents the slides form, open the address that the build or dev command reports. The slide page is the Present view and the keys are the ones above (`Esc` does not leave); `Home` and `End` go to the first and last slide, and the presenter window is the address with `?view=presenter`. The stage plugin's pen (`d`, or the pen in the control bar) has four inks, an eraser, undo and clear. Drawings are synced between the presenter window, the audience window and the classroom. When a server provides the pages (`presmium dev`, `presmium serve`), they are saved in the deck's `.presmium/drawings/`; a static site does not save them.

## Walk the real path before class

Verify what this class will use: moving forward and back in the audience window, the speaker notes following along, whether long code is readable, the run buttons and recorded outputs, sound and video. When the class uses a classroom, join from another browser or a student device and verify following, one answer, and revealing the result.

For an offline class, actually disconnect and try it; for a student version, open the student output and check its content; for a PDF, open the file and check the page count, missing pages and overflow. Verify only the capabilities this class uses, and state which external conditions you did not verify.

## Which address the students get

`presmium dev`, `presmium serve` and the workbench (`presmium studio`) are the author's own working environment and serve the full lecture. `presmium serve --host 0.0.0.0` has no login: anyone who reaches the port works in the workspace as the author. It offers no per-reader student view.

To share with students, build a static version with `presmium build --audience student`, and connect classroom interaction to a separate `presmium-classroom-server`. To publish the full lecture, build the full version as the user chooses. The commands are in the matching reference. Never hand out the address or start token of an author service as a student link.

## When something goes wrong in class

| Symptom | Check first |
|---|---|
| Students cannot open the link | Whether student devices reach the site and the classroom server; whether the address was written as `localhost` |
| The presenter window does not follow | Same browser and same origin; whether the popup opened |
| White page or 404 after rebuilding a static site | Restart the static server, then check `base` and how the slides route falls back |
| No classroom, recording or lecture entry | Whether the needed plugins are installed; whether this is a static site or a dev server |
| Pages show offline but code does not run | Whether the execution runtime was fetched in advance; remote environments and the classroom still need the network |

When content or steps are wrong, switch to `presmium-author`. When delivering, tell the user the address or file they can open, which path the presenter and the students each take, and what must be prepared again before the next class.
