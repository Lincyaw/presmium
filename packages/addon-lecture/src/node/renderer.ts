import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { workspaceSettings } from '@lincyaw/compiler'
import { errorMessage, SPEECH } from '@lincyaw/kernel'
import type { IRDocument, RenderContext, Renderer, SpeechService } from '@lincyaw/kernel'
import { captionLanguages, captionsVtt, chaptersVtt, CLIPS_DIR, deckTrack, eventsVtt, formatTrack, LECTURE_ID, lectureVoice, recordedSections, SCRIPT_TRACK, trackDuration } from '../domain/index.ts'
import type { Digest, LectureTrack } from '../domain/index.ts'
import { cachedClip, clipFile, clipKeys, pruneLock, synthesizedLecture, unsaidMessage } from './lecture.ts'
import { latestDoc, LECTURE_RENDERER, lectureConfig } from './plan.ts'
import { mediaFile, mediaPolicy, publishedMedia, readTrack, TRACK_FILE, trackIds } from './store.ts'
import type { MediaPolicy } from './store.ts'

export const digest: Digest = text => `sha256:${createHash('sha256').update(text).digest('hex')}`

function utteranceLine(text: string, id: string): number | undefined {
  const lines = text.split('\n')
  const from = lines.findIndex(line => line.trimStart().startsWith('"utterances"'))
  const at = lines.findIndex((line, i) => i > from && line.includes(`"id":${JSON.stringify(id)}`))
  return from === -1 || at === -1 ? undefined : at + 1
}

const clipsOf = (track: LectureTrack) => new Set(track.utterances.flatMap(u => u.clip ?? []))

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

async function publishSynthesized(doc: IRDocument, ctx: RenderContext, index: unknown[], tracks: LectureTrack[]): Promise<boolean> {
  const source = { file: doc.meta.entry, line: 1 }
  const speech = ctx.service?.(SPEECH)
  if (!speech) {
    ctx.report({ checkId: LECTURE_ID, severity: 'error', message: `renderers.lecture.voice: the lecture is said through the speech service, which no plugin provides; add @lincyaw/slidev-addon-speech to plugins`, source })
    return false
  }
  const made = await synthesizedLecture(doc, ctx.deckDir, speech)
  made.deck.findings.forEach(ctx.report)
  for (const u of made.unsaid) {
    ctx.report({ checkId: LECTURE_ID, severity: 'error', message: unsaidMessage(u), source: u.source ?? source, hint: 'define the engine of the voice (PRESMIUM_SPEECH_<ID>_URL and _PROVIDER), or build where the synthesis cache (.presmium/speech/) has the clips' })
  }
  if (!made.track) return false
  const text = formatTrack(made.track)
  publishTrack(made.track, text, doc.meta.entry, doc, ctx, clipsOf(made.track))
  index.push(summary(made.track))
  tracks.push(made.track)
  return true
}

function publishedTrack(doc: IRDocument, deckDir: string): (track: LectureTrack) => LectureTrack | undefined {
  const latest = latestDoc(deckDir)
  const own = latest?.meta.entry === doc.meta.entry ? latest : doc
  if (typeof own.meta.audience === 'string') return (track) => {
    const kept = deckTrack(track, own)
    return kept && recordedSections(kept, own)
  }
  return track => deckTrack(track, own)
}

async function recordedClips(track: LectureTrack, speech: SpeechService | undefined): Promise<{ clips: Set<string>, refused?: string }> {
  const clips = new Set<string>()
  for (const clip of clipsOf(track)) {
    if (!speech) return { clips, refused: 'its clips are given through the speech service, which checks a cloned voice\'s consent, and no plugin provides it; add @lincyaw/slidev-addon-speech to plugins' }
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
    const used = clipKeys(tracks)
    if (complete && (synthesize || used.size > 0)) pruneLock(ctx.deckDir, used)
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
