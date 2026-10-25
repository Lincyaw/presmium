# Recording and replay

For recording a class, publishing a lecture replay, revising the transcript, synthesizing speech from the narration and exporting a video. First decide whether to keep the live voice or to synthesize the lecture from the lecture's narration.

## Record once

The deck lists `@lincyaw/addon-lecture`; replaying pointers and spotlights also needs the guide plugin. Run `presmium dev --to web` in the deck directory, enter the Present view and start from the recording bar at the top right.

Choose the microphone, camera and screen as needed and grant the browser those permissions. Slide changes, steps, spotlights and annotations are recorded with the sound. Save after stopping; leaving the Present view also ends the recording. Record a short section first and play it back to confirm sound and actions are in sync, then record the whole lecture.

To re-record a section, choose the existing lecture, go to the section and choose Re-record section; leaving that section stops the recording and replaces the section. Give the sections and blocks that a long-lived replay refers to explicit labels, so they can still be located after the lecture is edited.

The files are `lectures/<id>/track.json` with an audio and video directory beside it. Commit the track file and keep the media separately: audio and video are ignored by git by default, and the track alone cannot restore the sound.

## Publish and check the replay

Add `lecture: {}` to `renderers` in the frontmatter, then:

```sh
presmium build --to web,lecture
```

Keep `dist/web/` and `dist/lecture/` in the same relative positions and serve the whole site as in [Publishing, export and offline](delivery.md). Add `?view=lecture&track=<id>` to the web address, or choose Lecture from the View menu. When they are deployed separately, write `presmium: { presmium.lecture: { url: <address of the replay files> } }` in the frontmatter.

Verify sound, captions, jumping from the transcript, section positioning, and returning to the lecture after Try it. After editing the lecture, run `presmium check` and fix the broken references that `presmium.lecture` reports; audio that still plays does not mean the replay is valid.

## Synthesize a lecture from the narration

The deck also lists `@lincyaw/addon-speech`, and `renderers.lecture.voice` chooses the engine and voice. The speech engine is configured in the operator's environment; credentials are never written into the deck. For example:

```yaml
renderers:
  web: {}
  lecture:
    voice: { engine: volcengine, voice: zh_female_xiaohe_uranus_bigtts }
```

With an existing speech service, keep its engine and voice. A custom engine is defined with the environment variables `PRESMIUM_SPEECH_<ID>_URL`, `_PROVIDER` and an optional `_KEY`; Volcengine can use `PRESMIUM_SPEECH_VOLCENGINE_KEY`. For an engine that only synthesizes or only transcribes, set the other model to `none` (`_TRANSCRIBE_MODEL=none` or `_MODEL=none`); transcription and synthesis then each go to an engine that can do them, and the deck need not name it. Confirm the target service and who pays before starting an operation that uploads or is billed.

After `presmium build --to web,lecture` synthesizes the lecture, play it with `?view=lecture&track=script`. The synthesized clips are kept in `.presmium/speech/` together with `.presmium/speech.lock.json`; committed with the deck, they let others build from the cache without a speech engine.

In the narration, `{cue}` schedules spotlights, steps and pauses, and `{say}` changes how a phrase is read; the syntax is in the inline roles part of `presmium-author/references/directives.md`. When a voice is set but the engine or some clips are missing, the check names the missing sentences. To publish only a live recording, do not configure a synthesis voice.

## Revise the transcript, change the voice, or turn it into lecture text

Play the recording back in the dev server and open the transcript. Before transcribing, confirm which service the recording will be sent to; after revising sentence by sentence, check the timing and the bound actions. Choosing a voice and synthesizing again sends the text to the speech service; play it back afterwards to confirm.

To turn a transcript into narration or a translation, have the agent edit the source in the workbench and review the result. The recording is raw material; the author still confirms the final lecture's content and structure.

## Export a video

The project needs `playwright-chromium` and its browser; when missing, install them as the error says. The command:

```sh
pnpm exec presmium-lecture export --track <id> --out lecture.webm
```

Without `--track`, it exports the synthesized lecture, else the only recorded one; without `--out`, it writes `dist/<track>.webm`. The default is 1280x720 at 30 fps; adjust with `--size <width>x<height>` and `--fps`. The output is WebM (MP4 is not written). Each caption language becomes a subtitle track in the video and is also written beside it (`lecture.zh-CN.vtt`); `--burn zh-CN` also draws that language's captions onto the picture, for players that cannot switch subtitles. Animated scenes (`{scene}`) and the cursor are drawn frame by frame at the lecture's time, so export is slower than the lecture itself: a lecture of a few minutes takes several minutes to export. Afterwards, open the file and check the start and end, sound, captions and that picture and sound are in sync. Synthesized voice keeps an AI-generated marker in the file's metadata.
