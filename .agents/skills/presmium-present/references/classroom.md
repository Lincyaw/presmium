# Classroom

A classroom lets students scan a QR code, follow the presenter's position on their own device, answer quizzes and polls, submit exercises and ask questions. It has three parts, each on its own address:

- the **student site**: a static build of the document for students, served on the class network;
- the **classroom server** (`presmium-classroom-server`): a small sync server the presenter and all students connect to;
- the **presenter's page**: the whole document, built with the same classroom server setting, opened by the teacher.

Do not run a class from `presmium dev` or `presmium serve`. Their built-in classroom sync is for the teacher rehearsing on this computer; anyone who reaches those services has the teacher's rights and sees the whole document.

## Prepare the site and the server

1. **Plugins.** List `@lincyaw/addon-session` (joining and following) and `@lincyaw/addon-classroom` (quizzes, polls, questions) in the frontmatter's `plugins`; add `@lincyaw/addon-exec` when students submit code exercises that are checked. Install each with `pnpm add -D <package>`.

2. **Start the classroom server** on a computer in the class network:

   ```sh
   pnpm add -g @lincyaw/classroom-server
   presmium-classroom-server --port 1234 --deck .
   ```

   Run it in the document folder: `--deck` is the folder where archived classrooms are written (default: the current folder). `--port` defaults to 1234 (`0` picks a free one); `--host` limits the address it listens on (default: every interface). It prints the addresses it can be reached at; pick the local-network one (such as `192.168.1.10`), not `localhost`, because student devices reach it there.

3. **Point the document at the server.** In the frontmatter of `lecture.md`, with the address printed in step 2:

   ```yaml
   presmium:
     presmium.session:
       server: ws://192.168.1.10:1234
   ```

   `presmium:` holds settings per plugin; `presmium.session` is the session plugin's. An `http://` address is turned into `ws://`. The address is written into the build, so rebuild after changing it.

4. **Build both versions** with that setting, each into its own folder:

   ```sh
   presmium build --to web --audience student --out dist-student
   presmium build --to web --out dist-full
   ```

   `--audience student` leaves out content marked for teachers only (for example a block with `:audience: teacher`; the markers are explained in `presmium-author/references/publishing.md`, "Content for students"). The two versions keep students at the same section as the presenter by the sections' ids, so give sections fixed labels (`(name)=` before the heading) when you edit between builds.

5. **Serve them** as static sites on the class network (commands in [delivery.md](delivery.md), "Give readers a web address"): `dist-student/web` for students, `dist-full/web` for the teacher.

**Network and safety.** The classroom server has no TLS and no login: anyone with the join link can join, so run it on the class's own network. A site served over HTTPS needs a `wss://` server address the browsers can reach. Only the browser window that created a classroom can end or archive it, open and close its quizzes, or move its students; everyone else writes only their own answers, questions, votes and submissions.

## Run a class

1. **Create the classroom.** The teacher opens the full site's address (the local-network address, not `localhost`), clicks **Classroom** in the navigation bar, then **Create classroom** (in the slides form, the classroom is in the presenter window's panel). A join link and a QR code appear. Scan it from a phone or open it in another browser to check that joining works.
2. **Following.** Students follow the presenter by default: when the teacher moves to another section or step, each student lands at the same place. A student who clicks **Browse alone** moves on their own; **Back to the presenter** resumes following. Check this once with your test student before class. Teacher-only content does not appear on students' screens, because their site was built without it.
3. **Quizzes.** On a quiz, the teacher clicks **Open answering**; students submit; the correct answer is shown only after the teacher clicks **Close answering**. For an exercise, the teacher sees who passed after students submit. Questions, polls and understanding checks are collected under **Interaction** in the teacher's classroom panel.
4. **After class.** Click **End classroom**, then **Archive classroom**. The archive is written to `.presmium/classroom/<room>.json` in the server's `--deck` folder; after that nobody can join or write. Personal notes are not archived. The archive is ignored by git by default; back it up separately when it must be kept.

A classroom lives in the server's memory: restarting the server before archiving loses its records. If the teacher's window closes by accident, reopen the same address in the same browser and choose **Rejoin classroom <room> as presenter**.

## Predictions and AI answers

The `{predict}` directive asks students to write a prediction before what follows is shown. In the web Document view the student must save a prediction first; in Present and in the slides, the teacher's next step reveals it as usual. When a document uses it, check it on a student device; the teacher's screen does not show the student side.

With `@lincyaw/addon-assistant` in `plugins` and a model set up in the teacher's browser (students need no model key), the teacher can generate an AI answer to a student's question, read it in their own window, and click **Send to the classroom**. Until it is sent, nobody else sees it.

## When students cannot join

Check separately that a student device opens the student site, and that it connects to the classroom server: the address, the port, and `ws://` for an `http://` site or `wss://` for an `https://` site. After changing the `server` setting: rebuild, restart the static server, and create the classroom again to get a new join link.
