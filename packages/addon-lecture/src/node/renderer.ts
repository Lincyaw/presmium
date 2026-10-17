/**
 * The `lecture` renderer (docs/ir.md 6.3): a site renderer that publishes
 * the deck's recorded lectures for the web form's lecture view, which reads
 * them from `../lecture/` of the same site (or `presmium.lecture.url`):
 *
 *   index.json                      the lectures: id, language, voice, length, caption languages
 *   <id>/track.json                 the track
 *   <id>/audio/*, <id>/video/*      its local media; under the operator's `url` policy
 *                                   (`settings.presmium.lecture.audio`) none: the track
 *                                   names them under that URL, where the operator puts them
 *   <id>/clips/*                    the synthesized clips of its utterances, from the synthesis cache
 *   <id>/captions.<lang>.vtt        the utterances and each translation (stale ones with a warning)
 *   <id>/chapters.vtt, events.vtt   chapters and the events as metadata
 *
 * A recorded lecture is published as the build's view of the deck has it
 * (P-55): without what was said and done in the sections its deck does not
 * have (`deckTrack`), such as the teachers' in `presmium build --audience
 * student`, whose compilation left the teachers' content out before any
 * pass. A build for an audience (the IR says which, `meta.audience`) then
 * publishes what was said, heard and shown only in the sections it has as
 * they were recorded (`recordedSections`, F-13): a section that lost a
 * teachers' block, or whose content moved into a teachers' section after the
 * recording, has another hash than the one the track recorded. Its clips (a
 * recorded lecture said again in a synthetic voice) are published as the
 * speech service gives them by their keys (`cachedClip`): a lecture with a
 * clip in a cloned voice whose consent was withdrawn is not published (D-7).
 *
 * With a voice (`renderers.lecture.voice`), it also says the deck's lecture
 * plan through `SPEECH` (WP-83): `script/`, the synthesized lecture. Clips
 * the synthesis cache has are not synthesized again; a clip it lacks with no
 * engine to make it fails the build, naming the utterance. A build that made
 * every lecture keeps only their keys in `.presmium/speech.lock.json`.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { workspaceSettings } from '@presmium/compiler'
import { errorMessage, SPEECH } from '@presmium/kernel'
import type { IRDocument, RenderContext, Renderer, SpeechService } from '@presmium/kernel'
import { captionLanguages, captionsVtt, chaptersVtt, CLIPS_DIR, deckTrack, eventsVtt, formatTrack, LECTURE_ID, lectureVoice, recordedSections, SCRIPT_TRACK, trackDuration } from '../domain/index.ts'
import type { Digest, LectureTrack } from '../domain/index.ts'
import { cachedClip, clipFile, clipKeys, pruneLock, synthesizedLecture, unsaidMessage } from './lecture.ts'
import { latestDoc, LECTURE_RENDERER, lectureConfig } from './plan.ts'
import { mediaFile, mediaPolicy, publishedMedia, readTrack, TRACK_FILE, trackIds } from './store.ts'
import type { MediaPolicy } from './store.ts'

/** The digest translations record of their original (P-137). */
export const digest: Digest = text => `sha256:${createHash('sha256').update(text).digest('hex')}`

/** Line of utterance `id` in `track.json`, written one utterance a line (`formatTrack`). */
function utteranceLine(text: string, id: string): number | undefined {
  const lines = text.split('\n')
  const from = lines.findIndex(line => line.trimStart().startsWith('"utterances"'))
  const at = lines.findIndex((line, i) => i > from && line.includes(`"id":${JSON.stringify(id)}`))
  return from === -1 || at === -1 ? undefined : at + 1
}

/** The clips a lecture's utterances say. */
const clipsOf = (track: LectureTrack) => new Set(track.utterances.flatMap(u => u.clip ?? []))

/** Publishes a lecture: its track, its media, the clips of `clips` (the others play silent), captions, chapters and events. */
function publishTrack(track: LectureTrack, text: string, file: string, doc: IRDocument, ctx: RenderContext, clips: ReadonlySet<string>, policy: MediaPolicy = { kind: 'ignore' }): void {
  const out = join(ctx.outDir, track.id)
  mkdirSync(out, { recursive: true })
  const audio = publishedMedia(track.audio, track.id, policy)
  const video = publishedMedia(track.video, track.id, policy)
  writeFileSync(join(out, TRACK_FILE), formatTrack({ ...track, ...audio ? { audio } : {}, ...video ? { video } : {} }))
  for (const segment of policy.kind === 'url' ? [] : [...track.audio ?? [], ...track.video ?? []]) {
    const source = mediaFile(ctx.deckDir, track.id, segment.src)
    if (!source) continue
    if (!existsSync(source)) {
      ctx.report({ checkId: LECTURE_ID, severity: 'warning', message: `lecture ${track.id}: ${segment.src} is not in this checkout; the lecture plays without it`, source: { file } })
      continue
    }
    mkdirSync(dirname(join(out, segment.src)), { recursive: true })
    copyFileSync(source, join(out, segment.src))
  }
  for (const clip of clipsOf(track)) {
    const source = clipFile(ctx.deckDir, clip)
    if (!source || !clips.has(clip) || !existsSync(source)) {
      ctx.report({ checkId: LECTURE_ID, severity: 'warning', message: `lecture ${track.id}: the clip ${clip} is not in the synthesis cache; its utterance plays silent`, source: { file } })
      continue
    }
    mkdirSync(join(out, CLIPS_DIR), { recursive: true })
    copyFileSync(source, join(out, CLIPS_DIR, clip))
  }
  for (const lang of captionLanguages(track)) {
    const captions = captionsVtt(track, lang, digest)
    writeFileSync(join(out, `captions.${lang}.vtt`), captions.vtt)
    for (const id of captions.stale) {
      ctx.report({
        checkId: LECTURE_ID,
        severity: 'warning',
        message: `lecture ${track.id}: the ${lang} translation of ${id} is stale: its original changed after it was translated`,
        source: { file, line: utteranceLine(text, id) },
        hint: 'translate the utterance again',
      })
    }
  }
  const titles = new Map(doc.sections.map(s => [s.id, s.title]))
  writeFileSync(join(out, 'chapters.vtt'), chaptersVtt(track, section => titles.get(section)))
  writeFileSync(join(out, 'events.vtt'), eventsVtt(track))
}

/** The synthesized lecture of a build: published when every utterance could be said; whether it failed. */
async function publishSynthesized(doc: IRDocument, ctx: RenderContext, index: unknown[], tracks: LectureTrack[]): Promise<boolean> {
  const source = { file: doc.meta.entry, line: 1 }
  const speech = ctx.service?.(SPEECH)
  if (!speech) {
    ctx.report({ checkId: LECTURE_ID, severity: 'error', message: `renderers.lecture.voice: the lecture is said through the speech service, which no plugin provides; add @presmium/slidev-addon-speech to plugins`, source })
    return false
  }
  const made = await synthesizedLecture(doc, ctx.deckDir, speech)
  made.deck.findings.forEach(ctx.report)
  for (const u of made.unsaid) {
    ctx.report({ checkId: LECTURE_ID, severity: 'error', message: unsaidMessage(u), source: u.source ?? source, hint: 'define the engine of the voice (PRESMIUM_SPEECH_<ID>_URL and _PROVIDER), or build where the synthesis cache (.presmium/speech/) has the clips' })
  }
  if (!made.track) return false
  const text = formatTrack(made.track)
  // Its clips were said through the speech service in this build, which checked their voices.
  publishTrack(made.track, text, doc.meta.entry, doc, ctx, clipsOf(made.track))
  index.push(summary(made.track))
  tracks.push(made.track)
  return true
}

/**
 * A recorded lecture as the build publishes it, `doc` being the build's view
 * of the deck: without the sections `doc` does not have, and, for an
 * audience, without what the sections that changed since the recording had
 * (`recordedSections`).
 */
function publishedTrack(doc: IRDocument, deckDir: string): (track: LectureTrack) => LectureTrack | undefined {
  const latest = latestDoc(deckDir)
  // The IR as compiled (the latest of this entry, which the passes kept), all of its forms' blocks (the lecture renderer's view lacks the web form's own).
  const own = latest?.meta.entry === doc.meta.entry ? latest : doc
  if (typeof own.meta.audience === 'string') return (track) => {
    const kept = deckTrack(track, own)
    return kept && recordedSections(kept, own)
  }
  return track => deckTrack(track, own)
}

/**
 * The clips of a recorded lecture the build may publish: those the speech
 * service gives by their keys now (`cachedClip`; the others, not in the
 * synthesis cache, play silent); `refused` says why one may not be given (a
 * cloned voice whose consent was withdrawn, D-7), and then the lecture is not
 * published.
 */
async function recordedClips(track: LectureTrack, speech: SpeechService | undefined): Promise<{ clips: Set<string>, refused?: string }> {
  const clips = new Set<string>()
  for (const clip of clipsOf(track)) {
    if (!speech) return { clips, refused: 'its clips are given through the speech service, which checks a cloned voice\'s consent, and no plugin provides it; add @presmium/slidev-addon-speech to plugins' }
    try {
      if (await cachedClip(speech, clip)) clips.add(clip)
    } catch (error) {
      return { clips, refused: `the clip ${clip} may not be published: ${errorMessage(error)}` }
    }
  }
  return { clips }
}

function summary(track: LectureTrack) {
  return { id: track.id, lang: track.lang, voice: track.voice, duration: trackDuration(track), captions: captionLanguages(track) }
}

export const lectureRenderer: Renderer = {
  id: LECTURE_RENDERER,
  site: true,
  support: () => 'full',
  async build(doc, ctx) {
    const index: unknown[] = []
    const tracks: LectureTrack[] = []
    const synthesize = Boolean(lectureVoice(lectureConfig(doc)))
    const policy = mediaPolicy(workspaceSettings(ctx.workspaceRoot).settings[LECTURE_ID] ?? {})
    const published = publishedTrack(doc, ctx.deckDir)
    let complete = !synthesize || await publishSynthesized(doc, ctx, index, tracks)
    for (const id of trackIds(ctx.deckDir)) {
      if (synthesize && id === SCRIPT_TRACK) {
        ctx.report({ checkId: LECTURE_ID, severity: 'warning', message: `lectures/${SCRIPT_TRACK} is not published: ${SCRIPT_TRACK} is the id of the synthesized lecture` })
        continue
      }
      let stored
      try {
        stored = readTrack(ctx.deckDir, id)
      } catch (error) {
        ctx.report({ checkId: LECTURE_ID, severity: 'error', message: `lecture ${id}: ${errorMessage(error)}` })
        complete = false
        continue
      }
      if (!stored) continue
      // The lock keeps the keys of the whole lecture: what this build leaves out is said in others.
      tracks.push(stored.track)
      const track = published(stored.track)
      if (!track) continue
      const { clips, refused } = await recordedClips(track, ctx.service?.(SPEECH))
      if (refused) {
        ctx.report({ checkId: LECTURE_ID, severity: 'error', message: `lecture ${id} is not published: ${refused}`, source: { file: stored.file } })
        continue
      }
      publishTrack(track, stored.text, stored.file, doc, ctx, clips, policy)
      index.push(summary(track))
    }
    mkdirSync(ctx.outDir, { recursive: true })
    writeFileSync(join(ctx.outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
    // The keys no lecture uses any more leave the lock file (the speech service only adds keys); a deck
    // whose lectures say nothing synthesized leaves it to whatever else wrote it.
    const used = clipKeys(tracks)
    if (complete && (synthesize || used.size > 0)) pruneLock(ctx.deckDir, used)
    return { outDir: ctx.outDir, skipped: [] }
  },
  // In `presmium dev` the lecture view reads the lectures from the server's routes: nothing to serve but where they are.
  async dev(_doc, ctx) {
    return {
      url: `${ctx.server?.url ?? ''}/__presmium/${LECTURE_ID}/tracks`,
      update: async () => {},
      close: async () => {},
    }
  },
}
