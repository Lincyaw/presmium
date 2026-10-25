import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { workspaceSettings } from '@lincyaw/compiler'
import { errorMessage, SPEECH } from '@lincyaw/kernel'
import type { IRDocument, RenderContext, Renderer, SpeechService } from '@lincyaw/kernel'
import { captionLanguages, captionsVtt, chaptersVtt, CLIPS_DIR, dropChangedSections, eventsVtt, formatTrack, LECTURE_ID, LECTURE_RENDERER, SCRIPT_TRACK, trackDuration, trimToDeck, utteranceLine } from '../domain/index.ts'
import type { LectureTrack } from '../domain/index.ts'
import { cachedClip, clipKeys } from './clips.ts'
import { latestDoc } from './latest-ir.ts'
import { deckPlan } from './plan.ts'
import { mediaFile, mediaPolicy, publishedMedia, readTrack, TRACK_FILE, trackIds } from './store.ts'
import type { MediaPolicy } from './store.ts'
import { synthesisFailureMessage, synthesizeLecture } from './synthesize.ts'

const clipsOf = (track: LectureTrack) => new Set(track.utterances.flatMap(u => u.clip ?? []))

function publishTrack(track: LectureTrack, text: string, file: string, doc: IRDocument, ctx: RenderContext, clipFiles: ReadonlyMap<string, string>, policy: MediaPolicy = { kind: 'ignore' }): void {
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
    const source = clipFiles.get(clip)
    if (!source || !existsSync(source)) {
      ctx.report({ checkId: LECTURE_ID, severity: 'warning', message: `lecture ${track.id}: the clip ${clip} is not in the synthesis cache; its utterance plays silent`, source: { file } })
      continue
    }
    mkdirSync(join(out, CLIPS_DIR), { recursive: true })
    copyFileSync(source, join(out, CLIPS_DIR, clip))
  }
  for (const lang of captionLanguages(track)) {
    const captions = captionsVtt(track, lang)
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
    if (captions.missing.length > 0) {
      ctx.report({
        checkId: LECTURE_ID,
        severity: 'warning',
        message: `lecture ${track.id}: the ${lang} captions leave out ${captions.missing.join(', ')}, which have no ${lang} translation`,
        source: { file, line: utteranceLine(text, captions.missing[0]!) },
        hint: 'translate those utterances too',
      })
    }
  }
  const titles = new Map(doc.sections.map(s => [s.id, s.title]))
  writeFileSync(join(out, 'chapters.vtt'), chaptersVtt(track, section => titles.get(section)))
  writeFileSync(join(out, 'events.vtt'), eventsVtt(track))
}

async function publishSynthesized(doc: IRDocument, ctx: RenderContext, index: unknown[], tracks: LectureTrack[]): Promise<boolean> {
  const source = { file: doc.meta.entry, line: 1 }
  const speech = ctx.service?.(SPEECH)
  if (!speech) {
    ctx.report({ checkId: LECTURE_ID, severity: 'error', message: `renderers.lecture.voice: the lecture is said through the speech service, which no plugin provides; add @lincyaw/addon-speech to plugins`, source })
    return false
  }
  const synthesized = await synthesizeLecture(doc, ctx.deckDir, speech)
  synthesized.deck.findings.forEach(ctx.report)
  for (const failure of synthesized.failures) {
    ctx.report({ checkId: LECTURE_ID, severity: 'error', message: synthesisFailureMessage(failure), source: failure.source ?? source, hint: 'define the engine of the voice (PRESMIUM_SPEECH_<ID>_URL and _PROVIDER), or build where the synthesis cache (.presmium/speech/) has the clips' })
  }
  for (const cut of synthesized.cuts) {
    ctx.report({ checkId: LECTURE_ID, severity: 'warning', message: `lecture ${SCRIPT_TRACK}: {cue}\`next\` moves on ${Math.round(cut.left)} ms before the animation of step ${cut.step} of section ${cut.section} has played`, source: cut.source ?? source, hint: 'say the cue later, or shorten the animation (:durations:)' })
  }
  const { track } = synthesized
  if (!track) return false
  const clipFiles = new Map([...synthesized.clips.values()].map(clip => [clip.file, clip.path]))
  publishTrack(track, formatTrack(track), doc.meta.entry, doc, ctx, clipFiles)
  index.push(summary(track))
  tracks.push(track)
  return true
}

function publishedTrack(doc: IRDocument, deckDir: string): (track: LectureTrack) => LectureTrack | undefined {
  const latest = latestDoc(deckDir)
  const own = latest?.meta.entry === doc.meta.entry ? latest : doc
  if (typeof own.meta.audience === 'string') return (track) => {
    const kept = trimToDeck(track, own)
    return kept && dropChangedSections(kept, own)
  }
  return track => trimToDeck(track, own)
}

async function recordedClipFiles(track: LectureTrack, speech: SpeechService | undefined): Promise<{ clipFiles: Map<string, string>, refused?: string }> {
  const clipFiles = new Map<string, string>()
  for (const clip of clipsOf(track)) {
    if (!speech) return { clipFiles, refused: 'its clips are given through the speech service, which checks a cloned voice\'s consent, and no plugin provides it; add @lincyaw/addon-speech to plugins' }
    try {
      const found = await cachedClip(speech, clip)
      if (found) clipFiles.set(clip, found.audio)
    } catch (error) {
      return { clipFiles, refused: `the clip ${clip} may not be published: ${errorMessage(error)}` }
    }
  }
  return { clipFiles }
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
    const synthesize = Boolean(deckPlan(doc, ctx.deckDir).voice)
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
      tracks.push(stored.track)
      const track = published(stored.track)
      if (!track) continue
      const { clipFiles, refused } = await recordedClipFiles(track, ctx.service?.(SPEECH))
      if (refused) {
        ctx.report({ checkId: LECTURE_ID, severity: 'error', message: `lecture ${id} is not published: ${refused}`, source: { file: stored.file } })
        continue
      }
      publishTrack(track, stored.text, stored.file, doc, ctx, clipFiles, policy)
      index.push(summary(track))
    }
    mkdirSync(ctx.outDir, { recursive: true })
    writeFileSync(join(ctx.outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
    const used = clipKeys(tracks)
    if (complete && (synthesize || used.size > 0)) await ctx.service?.(SPEECH)?.pruneLock?.(used)
    return { outDir: ctx.outDir, skipped: [] }
  },
  async dev(_doc, ctx) {
    return {
      url: `${ctx.server?.url ?? ''}/__presmium/${LECTURE_ID}/tracks`,
      update: async () => {},
      close: async () => {},
    }
  },
}
