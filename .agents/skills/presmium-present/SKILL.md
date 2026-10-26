---
name: presmium-present
description: "Present and deliver a Presmium document, run classroom interaction, export or record it, and manage structured narration, real speech synthesis, subtitles and video playback from lecture.json production settings. 放映、上课、导出、录课、配音、字幕与讲授视频时使用。"
---

# Presenting and producing a lecture

The editable document is `lecture.json`. Reading, slides, notebook and narrated lecture are derived forms. The **lecture** is narrated playback/video, not a second editable source. Keep document editing, compiled presentation and video production separate.

| Task | Read |
|---|---|
| Present, share or prepare offline outputs | [Delivery](references/delivery.md) |
| Classroom questions, quizzes and interaction | [Classroom](references/classroom.md) |
| Narration, voice, captions, recording or video | [Lecture production](references/lecture.md) |

Read the document and installed plugin capabilities before operating. Compilation can fail while the document remains saved; identify which source version a displayed snapshot represents. Never use stale audio or a stale generated result as the current document's result.

## Run only the requested output

```sh
presmium check lesson --json
presmium dev lesson
presmium build lesson --to slides
presmium build lesson --to lecture
```

Renderers are configured in `metadata.renderers`; document plugins in `metadata.plugins` and document plugin settings in `metadata.presmium`. Operator credentials and provider endpoints remain outside the document. Read the installed renderer's public configuration for actual export support.

## Narration and playback rules

Steps explicitly reference structured narrations. Voice source and playback timing are owned by `production`. Resolve actual provider voices and supported parameters instead of inventing a catalogue. Changing a voice or script does not synthesize automatically. Explain the target/provider and scope before an explicit paid action.

Audition and formal playback share exclusive ownership: starting either stops or pauses the other. Seeking pauses first and reconstructs the selected step state. Cancel a task without deleting valid completed cache entries. Confirm saved/generated results against target document, request and version.

Check visible content, captions, step navigation and audio on the actual output. A successful compile alone does not prove playable speech or a working exporter.
