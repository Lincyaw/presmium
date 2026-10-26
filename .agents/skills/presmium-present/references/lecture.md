# Narration, speech and lecture production

`lecture.json` is the only content authority. Narrations contain typed text, pronunciation and cue nodes; steps name narration IDs. Read the installed kernel contract for exact fields. Captions, spoken text and alignments derive from the same narration structure. A transcript becomes authored text only through an explicit adopt action.

## Open the saved version in the studio

Use the document toolbar's presentation preview action after the authoring save is acknowledged. Preparation compiles the exact confirmed document and stays in the editor until compilation succeeds. Continue editing to cancel that transition; a late response must not take the author away from new input or another document. A compilation error leaves the document and draft intact with a readable failure.

The presentation identifies its confirmed source version. When the source or an observed project dependency changes, use the refresh icon's explicit recompile action to adopt the new result. Unconfirmed runtime revisions are hidden. This version check does not freeze historical project assets or external dependencies.

## Configure the intended source

Put lecture renderer options in `metadata.renderers.lecture`. Put timing and voice choice only in `production`: document defaults, optional section overrides and step overrides. A voice source is `none`, TTS with an actual engine/voice, or a recording asset. Do not keep a second `voice` or timing decision on renderer options, a step or narration text.

TTS providers, credentials and endpoints are operator configuration. Check the speech service's real engines and voice catalogue. `unavailable` differs from an empty available list. Unknown parameter capability stays unknown; do not imply unsupported style/rate options work.

## Generate explicitly

A cache-only preview can play existing exact-text/exact-voice audio; a missing cache entry is a missing capability until generated. Use the installed lecture/speech generation action or documented API to synthesize an explicit revision-bound scope. Show provider, count and target before a paid operation. Never synthesize merely by opening the document, editing text, auditioning another voice or refreshing preview.

Checks, lecture builds and video exports read only exact cached voiceover. A configured engine does not make missing audio ready: generate it explicitly before exporting; these read/output actions never synthesize it.

Completed audio belongs to the exact content and voice configuration that produced it. Old callbacks cannot clear new input or label old audio current. Cancellation stops remaining work and retains completed valid cache. Reuse cache only when the real synthesis key matches.

## Align and produce

Cue content supplies stable targets and actions; `production.cueTimings` owns delays. Timing defaults/overrides decide narration start, minimum hold and trailing pause. Recording/media clips use asset references, explicit source ranges and step attachments. Derived absolute playback times stay in the playback plan.

```sh
presmium check lesson --json
presmium build lesson --to lecture
```

Build only when the required speech cache and provider capability actually exist. Inspect missing/stale diagnostics, caption text, pronunciation, cue timing, arbitrary step navigation and the exported video. A prior successful snapshot must be visibly identified when current compilation failed.
