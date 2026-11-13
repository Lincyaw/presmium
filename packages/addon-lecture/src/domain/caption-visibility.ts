import { stepCaptionsVisible } from '@lincyaw/kernel'
import type { IRDocument } from '@lincyaw/kernel'
import type { LectureTrack } from './track.ts'
import { trackDuration } from './track.ts'
import { stepStops, timedEvents } from './timing.ts'

/** Bind the authored visibility to real playback boundaries, including word-anchored next cues. */
export function applyCaptionVisibility(doc: IRDocument, track: LectureTrack): void {
  const stops = stepStops(timedEvents(track)), end = trackDuration(track)
  const hidden: NonNullable<LectureTrack['captionHidden']> = []
  for (const [index, stop] of stops.entries()) {
    const section = doc.sections.find(section => section.id === stop.section)
    if (section && !stepCaptionsVisible(doc.production, section.id, section.stepIds?.[stop.step]))
      hidden.push({ section: section.id, step: stop.step, startMs: stop.t, endMs: stops[index + 1]?.t ?? end })
  }
  if (hidden.length) track.captionHidden = hidden
  else delete track.captionHidden
}

export function captionVisibleAt(track: LectureTrack, time: number): boolean {
  return !track.captionHidden?.some(hidden => hidden.startMs <= time && time < hidden.endMs)
}

/** Only display ranges change; original text, words, audio and manual maps remain intact. */
export function visibleCaptionGroups<T extends { id: string, t: number, d: number }>(track: LectureTrack, groups: readonly T[], position?: { section: string, step: number }): T[] {
  if (!track.captionHidden?.length) return [...groups]
  return groups.flatMap(group => {
    if (!(group.d > 0)) return captionVisibleAt(track, group.t) && !track.captionHidden?.some(hidden => hidden.startMs === hidden.endMs && hidden.startMs === group.t && hidden.section === position?.section && hidden.step === position?.step) ? [group] : []
    let ranges = [{ from: group.t, to: group.t + group.d }]
    for (const hidden of track.captionHidden!) ranges = ranges.flatMap(range =>
      hidden.endMs <= range.from || hidden.startMs >= range.to ? [range] : [
        ...range.from < hidden.startMs ? [{ from: range.from, to: hidden.startMs }] : [],
        ...hidden.endMs < range.to ? [{ from: hidden.endMs, to: range.to }] : [],
      ])
    return ranges.length === 1 && ranges[0]!.from === group.t && ranges[0]!.to === group.t + group.d ? [group]
      : ranges.map((range, index) => ({ ...group, id: `${group.id}:visible:${index}`, t: range.from, d: range.to - range.from }))
  })
}
