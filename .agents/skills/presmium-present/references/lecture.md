# Recording and replay

A **lecture** is narrated playback of the document: the presentation moves through its sections and steps while a voice speaks, with captions and a transcript. A lecture comes from one of two sources:

- **recorded**: the teacher presents in the browser and the microphone (and optionally camera and screen) is recorded together with every slide change, step, spotlight and annotation;
- **synthesized**: a speech engine reads the document's narration aloud.

Each lecture is a **track** with an id: a recorded track gets its id when saved; the synthesized one is always `script`. First decide with the teacher whether to keep their live voice (record) or synthesize from the narration.

All of this needs `@lincyaw/addon-lecture` in the frontmatter's `plugins` (install with `pnpm add -D @lincyaw/addon-lecture`); replaying pointers and spotlights also needs `@lincyaw/addon-guide`.

## Record a class

1. Run `presmium dev --to web` in the document folder and open the address it prints. Recording saves into the document folder, so it needs this server (or `presmium serve`); it is not offered on a static site or in the studio's preview.
2. Enter the Present view (View menu, **Present**). The recording bar is at the top right. If a lecture is already playing there (for example the synthesized one), close its player first.
3. Choose the microphone, and the **Camera** or **Screen** if wanted, then click **Record** and allow the browser's permission prompts.
4. Present as usual. Click **Stop** when done (leaving Present also stops). The recording is saved automatically; the bar shows **Saved <id>**.
5. Do a short test first: record one section, play it back, and check that the sound and the slide actions are in sync. Then record the whole class.

**Re-record one section.** In the recording bar choose the existing lecture in the **Lecture** list, go to the section and click **Re-record section**. Leaving that section stops the recording and replaces just that section.

**Keep it findable.** A track refers to sections and blocks by their ids. Generated ids change when headings or content change, so give the sections and blocks a long-lived lecture points at fixed labels (`(name)=` before a heading, `:label:` on a directive; see `presmium-author/references/writing.md`).

**Files.** A recording is `lectures/<id>/track.json` with its audio and video files beside it. Commit `track.json`, and keep the audio and video somewhere else: git ignores them by default, and the track alone cannot restore the sound.

## Publish the replay

1. Add the lecture form to `renderers` in the frontmatter:

   ```yaml
   renderers:
     web: {}
     lecture: {}
   ```

2. Build both forms and serve the whole `dist/` folder as in [delivery.md](delivery.md) ("Give readers a web address"), keeping `dist/web/` and `dist/lecture/` side by side:

   ```sh
   presmium build --to web,lecture
   pnpm exec sirv dist --port 8080
   ```

3. Open the web page with `?view=present&track=<id>` added to its address. Entering Present loads that track; with no `track`, it loads the synthesized lecture, or the only recorded one. Playback starts when you click **Play**. With several recorded tracks, pick one from the play button in the presentation bar. (Older links with `view=lecture` still work.)

When the lecture files are hosted at a different address from the web page, give that address in the frontmatter: `presmium: { presmium.lecture: { url: <address of the lecture files> } }`.

**Check the replay**: the sound, the captions, clicking a sentence in the **Transcript** jumps there, the right section shows at each moment, and **Back to the lecture** returns after a viewer clicks **Try it** (which pauses the lecture so they can try things themselves). After editing the document, run `presmium check` and fix the broken references reported under `presmium.lecture` (recorded actions that no longer match a section or block). Sound that still plays does not prove the replay is right.

## Synthesize a lecture from the narration

1. Add `@lincyaw/addon-speech` to `plugins` (and install it), and choose the engine and voice in `renderers.lecture.voice`:

   ```yaml
   renderers:
     web: {}
     lecture:
       voice: { engine: volcengine, voice: zh_female_xiaohe_uranus_bigtts }
   ```

   When the project already uses a speech service, keep its engine and voice.

2. Make sure the engine is defined. Engines are defined in the environment variables of the computer that builds, never in the document, so no credentials end up in it:
   - Volcengine: `PRESMIUM_SPEECH_VOLCENGINE_KEY`.
   - Any other engine with an OpenAI-compatible speech API, with an id of your choice (`engine: <id>` in the frontmatter): `PRESMIUM_SPEECH_<ID>_URL` (its address), `PRESMIUM_SPEECH_<ID>_PROVIDER` (the provider's name, shown when Presmium asks before sending text or audio) and optionally `PRESMIUM_SPEECH_<ID>_KEY`. `_MODEL` and `_TRANSCRIBE_MODEL` choose the models (default `tts-1` and `whisper-1`). For an engine that only synthesizes or only transcribes, set the other one to `none` (`_TRANSCRIBE_MODEL=none` or `_MODEL=none`); each job then goes to an engine that can do it, and the document need not name it.

   Synthesis and transcription send text or audio to that service, which may charge: confirm with the teacher which service it is and who pays before running them.

3. Run `presmium build --to web,lecture`. It synthesizes the narration and builds the lecture. Serve and open it as above with `?view=present&track=script`, and listen to it.

The synthesized clips are kept in `.presmium/speech/` with `.presmium/speech.lock.json`. Commit them with the document: then others can build the lecture from this cache without a speech engine, and only changed sentences are synthesized again.

In the narration, the role ``{cue}`next` `` (and `spot`, `pause 800ms` and others) schedules steps, spotlights and pauses at a word, and ``{say alias="B P E"}`BPE` `` shows one spelling and speaks another; the full syntax is under `{cue}` and `{say}` in `presmium-author/references/directives.md`. When a voice is set but the engine or some clips are missing, `presmium check` names the sentences that cannot be said. To publish only a live recording, do not set a voice.

## Revise the transcript, change the voice, or turn a recording into narration

Play the recording back from `presmium dev` and open the **Transcript** panel. **Transcribe (<provider>)** sends the audio to that speech service (it asks first); confirm with the teacher which service it is. After correcting the sentences one by one, check the timing and the actions bound to them. Choosing a **Voice** and clicking **Say again (<provider>)** sends the text to the speech service; play it back afterwards.

To turn a transcript into narration or a translation, have the agent edit the document's source (for example in the studio) and have the teacher review the result. The recording is raw material; the teacher decides the final content and structure.

## Export a video

The project needs `playwright-chromium` and its browser (`pnpm add -D playwright-chromium`, then `pnpm exec playwright install chromium`; the error says so when they are missing). In the document folder:

```sh
pnpm exec presmium-lecture export --track <id> --out lecture.webm
```

| Option | Does |
|---|---|
| `--track <id>` | Which lecture; default: the synthesized one, else the only recorded one |
| `--out <file.webm>` | Where to write; default `dist/<track>.webm` |
| `--size <width>x<height>` | Picture size; default `1280x720` |
| `--fps <n>` | Frames per second; default 30 |
| `--burn <lang>` | Also draw that language's captions onto the picture (such as `--burn zh-CN`), for players that cannot switch subtitles |

The output is WebM only (no MP4). Each caption language becomes a subtitle track in the video and is also written beside it (`lecture.zh-CN.vtt`). Animations written in code (`{scene}`) and the cursor are drawn frame by frame at the lecture's time, so exporting is slower than playing: a lecture of a few minutes takes several minutes. In the studio, **Export** in the command bar also makes lecture videos.

Afterwards, open the file and check the start and end, the sound, the captions, and that picture and sound are in sync. A synthesized voice leaves an AI-generated marker in the file's metadata.
