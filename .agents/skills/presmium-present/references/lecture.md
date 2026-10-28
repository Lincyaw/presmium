# Narration, speech and lecture production

`lecture.json` is the only content authority. Narrations contain typed text, pronunciation and cue nodes; steps name narration IDs. Read the installed kernel contract for exact fields. Captions, spoken text and alignments derive from the same narration structure. A transcript becomes authored text only through an explicit adopt action.

## Open the saved version in the studio

Use the document toolbar's presentation preview action after the authoring save is acknowledged. Preparation compiles the exact confirmed document and stays in the editor until compilation succeeds. Continue editing to cancel that transition; a late response must not take the author away from new input or another document. A compilation error leaves the document and draft intact with a readable failure.

The presentation identifies its confirmed source version. When the source or an observed project dependency changes, use the refresh icon's explicit recompile action to adopt the new result. Unconfirmed runtime revisions are hidden. This version check does not freeze historical project assets or external dependencies.

## Edit scripts and voices in video production

Use the document toolbar's **Video production** action for the independent production workspace. Its page and step controls select stable authoring steps; the script and timing fields write to the same canonical source. The visual preview compiles a confirmed saved version separately. Returning to the document retains the original body editor.

In Document editor, **Captions** opens only caption text and narration start. Pronunciation tools, hold, trailing pause and media properties belong in Video production; do not add routine explanations of the data model to the editor.

**Choose a voice** edits a recoverable settings draft. Choose this step, selected steps, this page or the document; review the affected scope before applying. Batch changes preserve independent settings by default, including explicit silence and recording sources. Replacing them requires a separate count-based confirmation. Restoring inheritance removes voice settings at the chosen level; it does not mean explicit silence. A changed source invalidates the confirmation and keeps the draft.

Audition and generation each require their own explicit confirmation. No connected provider does not invalidate exact existing cache audio. The generation dialog reports actual cache, missing and unavailable counts; these are not a price quote. Closing requests cancellation of work confirmed in that dialog, retaining completed exact caches. Video production provides local audio import and clip forms as described below. Video files and subtitle alignment are not yet supported. In Video production, **Original audio** records a candidate or selects saved audio. **Save as audio asset** only saves the material; **Use as step voiceover** explicitly adopts the whole file for this stable step through the same authoring API as MCP.

The production timeline shows the current page's visuals, voiceover and captions from the shared `ProductionPlan`. Waveforms come from decoding the actual cached audio. The exact position field uses seconds relative to the page; the transport displays time in the whole lecture. Seeking pauses first and uses the existing lecture player to reconstruct the selected step. Zoom and fit change only the view. On narrow screens use the Visuals, Script and voice, and Timeline tabs; changing tabs retains the same playback runtime.

Only confirmed timing can play or seek by time. Missing exact voiceover stays estimated; unknown animation duration, unsupported recording cues/video clips and silent text-anchored cues have explicit diagnostics. Step selection remains available. Explicit `none` supports simple silent scripts and authored hold/pause timing without a provider; an unset voice with narration is not silence. A nonzero text cue in a silent script needs confirmed timing or audio.

Documents created in Studio declare the standard production plugins and lecture renderer. Studio's new documents and pages hold each static step for 4 seconds plus a 0.5-second trailing pause; validation does not insert these defaults into other documents. Existing documents keep their source unchanged until the author chooses Enable video production; enabling does not select a voice or generate speech. Use the production toolbar's compile icon after source changes or an explicit cache update. An unchanged plan remains paused at its actual time and rate; a new source or plan invalidates the old playback binding.

## Configure the intended source

Put lecture renderer options in `metadata.renderers.lecture`. Put timing and voice choice only in `production`: document defaults, optional section overrides and step overrides. A voice source is `none`, TTS with an actual engine/voice, or a recording asset. Do not keep a second `voice` or timing decision on renderer options, a step or narration text.

TTS providers, credentials and endpoints are operator configuration. Check the speech service's real engines and voice catalogue. `unavailable` differs from an empty available list. Unknown parameter capability stays unknown; do not imply unsupported style/rate options work.

## Generate explicitly

A cache-only preview can play existing exact-text/exact-voice audio; a missing cache entry is a missing capability until generated. Use the installed lecture/speech generation action or documented API to synthesize an explicit revision-bound scope. Show provider, count and target before a paid operation. Never synthesize merely by opening the document, editing text, auditioning another voice or refreshing preview.

Checks, lecture builds and video exports read only exact cached voiceover. A configured engine does not make missing audio ready: generate it explicitly before exporting; these read/output actions never synthesize it.

Completed audio belongs to the exact content and voice configuration that produced it. Old callbacks cannot clear new input or label old audio current. Cancellation stops remaining work and retains completed valid cache. Reuse requires the synthesis key, current non-credential engine profile and actual audio SHA. Without that engine configured, commit the cache and matching speech lock: one locked profile can satisfy a request; multiple profiles are ambiguous. Legacy locked audio is still readable offline, but is not proof of a configured provider's identity. Unknown or mismatched alignment bindings are unavailable, not precise timing.

## Align and produce

Cue content supplies stable targets and actions; `production.cueTimings` owns delays. Timing defaults/overrides decide narration start, minimum hold and trailing pause. Recording/media clips use asset references, explicit source ranges and step attachments. Derived absolute playback times stay in the playback plan.

Local audio `production.mediaClips` can reference an existing canonical audio asset in the same document. Set `sourceRange` in milliseconds, an attached stable step and offset, `volume` from 0 to 1, and optional `muted`; muting retains the volume. The inspected audio range must fit entirely inside that confirmed step. Adjust trimming, offset or the authored hold when it does not fit; the plan does not retime cues or cross steps automatically. These clips mix with cached speech in preview and WebM export, without generating or changing captions. Files must be non-hidden, regular local audio; symlinks, remote/shared paths and video are rejected. Use the source-bound `production-asset` reader to inspect a referenced AssetID and the plan diagnostics to confirm availability. Saving JSON does not confirm the actual audio range.

To use original audio as narration, use Video’s **Original audio → Use as step voiceover**, or explicitly call the shared `adopt_recording` action for a saved source, stable step, audio asset and actual SHA-256; see `DocumentRecordingAdoption`. This sets `voiceSource.recording`, never a fabricated media clip. Each effective step plays its selected source range once; without a range it plays the whole file. In Video, **Narration range** edits the already adopted same-asset step with real in/out bounds. Restore full changes pending input and needs explicit Apply. Editing one step does not trim the asset or another step. Current Narration display text forms one whole-clip caption without word alignment; empty narration produces no caption. Trim keeps the whole authored script as an unaligned step caption and requires review; original ASR word times do not become trimmed alignment. Continuous cross-step recording, internal pauses, non-start cues and conflicting narration starts remain unsupported. Adoption preserves all narration and pronunciation, and does not start ASR, TTS or playback. The accepted version is prepared paused; late replies preserve newer input and microphone captures. Browser-controlled recording evidence does not verify a physical microphone, and MCP recording-client control is not connected.

In Video production, use **Audio clip → Import audio**, then select the asset and edit the paired in/out fields, step offset, volume and mute. Import only adds an asset; **Add to step** or **Apply** explicitly saves the clip. Invalid text remains editable. **Restore full** changes the pending range; removing a clip retains the asset. Pending input follows its document, stable step and clip; accepting a saved media change prepares that version and stays paused.

The workspace authoring API imports original audio through `document/audio`: multipart fields are `change` (JSON with `id` and `baseDocumentVersion`) and `file`. Original bytes and the canonical asset declaration share one version-checked transaction and history entry. The same route's GET uses `assetId` and `baseDocumentVersion` to inspect even an unused declared asset, without requesting compilation. Explicit `document/media-clip` changes carry the source version and full production binding; they save trim, offset, gain and mute only when the real range fits a confirmed step.

```sh
presmium check lesson --json
presmium build lesson --to lecture
```

Build only when the required speech cache and provider capability actually exist. Inspect missing/stale diagnostics, caption text, pronunciation, cue timing, arbitrary step navigation and the exported video. A prior successful snapshot must be visibly identified when current compilation failed.
