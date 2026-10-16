/**
 * The `lecture` renderer (docs/ir.md 6.3): a site renderer that publishes
 * the deck's recorded lectures for the web form's lecture view, which reads
 * them from `../lecture/` of the same site (or `presmium.lecture.url`):
 *
 *   index.json                      the lectures: id, language, voice, length, caption languages
 *   <id>/track.json                 the track
 *   <id>/audio/*, <id>/video/*      its local media
 *   <id>/captions.<lang>.vtt        the utterances and each translation (stale ones with a warning)
 *   <id>/chapters.vtt, events.vtt   chapters and the events as metadata
 *
 * Synthesized lectures (WP-83) are written by the same renderer.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { errorMessage } from '@presmium/kernel'
import type { IRDocument, RenderContext, Renderer } from '@presmium/kernel'
import { captionLanguages, captionsVtt, chaptersVtt, eventsVtt, formatTrack, LECTURE_ID, trackDuration } from '../domain/index.ts'
import type { Digest, LectureTrack } from '../domain/index.ts'
import { mediaFile, readTrack, TRACK_FILE, trackIds } from './store.ts'

/** The digest translations record of their original (P-137). */
export const digest: Digest = text => `sha256:${createHash('sha256').update(text).digest('hex')}`

/** Line of utterance `id` in `track.json`, written one utterance a line (`formatTrack`). */
function utteranceLine(text: string, id: string): number | undefined {
  const lines = text.split('\n')
  const from = lines.findIndex(line => line.trimStart().startsWith('"utterances"'))
  const at = lines.findIndex((line, i) => i > from && line.includes(`"id":${JSON.stringify(id)}`))
  return from === -1 || at === -1 ? undefined : at + 1
}

function publishTrack(track: LectureTrack, text: string, file: string, doc: IRDocument, ctx: RenderContext): void {
  const out = join(ctx.outDir, track.id)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, TRACK_FILE), formatTrack(track))
  for (const segment of [...track.audio ?? [], ...track.video ?? []]) {
    const source = mediaFile(ctx.deckDir, track.id, segment.src)
    if (!source) continue
    if (!existsSync(source)) {
      ctx.report({ checkId: LECTURE_ID, severity: 'warning', message: `lecture ${track.id}: ${segment.src} is not in this checkout; the lecture plays without it`, source: { file } })
      continue
    }
    mkdirSync(dirname(join(out, segment.src)), { recursive: true })
    copyFileSync(source, join(out, segment.src))
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

export const lectureRenderer: Renderer = {
  id: 'lecture',
  site: true,
  support: () => 'full',
  async build(doc, ctx) {
    const index: unknown[] = []
    for (const id of trackIds(ctx.deckDir)) {
      let stored
      try {
        stored = readTrack(ctx.deckDir, id)
      } catch (error) {
        ctx.report({ checkId: LECTURE_ID, severity: 'error', message: `lecture ${id}: ${errorMessage(error)}` })
        continue
      }
      if (!stored) continue
      const { track } = stored
      publishTrack(track, stored.text, stored.file, doc, ctx)
      index.push({ id, lang: track.lang, voice: track.voice, duration: trackDuration(track), captions: captionLanguages(track) })
    }
    mkdirSync(ctx.outDir, { recursive: true })
    writeFileSync(join(ctx.outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
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
