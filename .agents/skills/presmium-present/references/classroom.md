# Classroom

For students who scan a code to join, follow the presenter, answer quizzes and ask questions. First prepare a lecture site the students can reach, then configure classroom sync. A local preview only the presenter can open is not a student link.

## Prepare the site and the server

The deck lists `@lincyaw/addon-session` and `@lincyaw/addon-classroom`; checking code exercises also needs the execution plugin `@lincyaw/addon-exec`. Build a static version for students; the audience markers are in `presmium-author/references/publishing.md`.

When a separate classroom server is needed, install it with `pnpm add -g @lincyaw/classroom-server` and run it in the deck directory:

```sh
presmium-classroom-server --port 1234 --deck .
```

The server prints the addresses it can be reached at. Write the address students can reach into the deck's frontmatter, replacing the IP below with the actual address of the machine that runs the server:

```yaml
presmium:
  presmium.session:
    server: ws://192.168.1.10:1234
```

The setting is written into the output. Then run `presmium build --audience student --out dist-student`; how to serve the static site is in [Publishing, export and offline](delivery.md). The presenter also uses a lecture built with the same classroom server setting; the full and the student versions map positions to each other through stable labels.

The classroom server listens on every interface by default, with no TLS and no authentication: anyone with the link can join. Deploy it on the class's own network. An HTTPS site needs a WSS server address the browser can reach. Only the window that created a classroom can end or archive it, open and close its quizzes, or move its learners; the others write only their own answers, questions, votes and submissions. Students reach the static site and the classroom server, not the author's workspace.

The sync built into `presmium dev` and `presmium serve` is for the author's rehearsal on this machine. Do not expose the author's workspace to run a class: whoever reaches that service has the author's rights and gets the full lecture.

## Walk through a whole class

1. The presenter opens the lecture and creates a classroom from Classroom in the web navigation, or from the presenter panel of the slides. Use the site's network address for the join link, not `localhost`. Scan the QR code from a student device or another browser to join.
2. Verify following, the default: the presenter moves to another section and advances a step, and the student lands at the same place. A student who clicks Browse alone moves on their own; Back to the presenter restores following. Students need not see teacher-only steps that the student version lacks.
3. For a quiz, first Open answering; students submit; only after the presenter clicks Close answering is the correct answer revealed. After an exercise is submitted, look at who passed. Questions, polls and understanding checks are collected under Interaction.
4. After class, end the classroom first, then archive it. The archive is saved in the classroom server's `--deck` directory as `.presmium/classroom/<room>.json`; after that nobody can join or write. Personal notes are not archived. The archive is ignored by git by default; back it up separately when it must be kept.

A classroom lives in the server's memory: restarting the server before archiving loses its records. If the presenter window closes by accident, reopen the same lecture address in the same browser and choose "Rejoin classroom <room> as presenter".

## How predictions and questions are revealed

`{predict}` in the web Document view makes students save a prediction before they see what follows; in Present and in the slides, the presenter still advances to the reveal. When a lecture uses it, verify the student side for real; the projected screen alone does not show it.

With the assistant plugin `@lincyaw/addon-assistant` in `plugins` and a model configured, the presenter can generate an AI answer to a question, review it in their own window first, then click Send to the classroom. The model setting is kept in the presenter's browser; students need no model key. A generated answer is not shared with the class until it is sent.

## When students cannot join

Verify separately that a student device opens the static site and that it connects to the classroom server. Check the address, the port, WS or WSS against the site's protocol. After changing the setting, rebuild, restart the static server, then create the join link again.
