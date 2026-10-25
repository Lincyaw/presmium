import { useMessages } from '@lincyaw/host'
import { clockText, LECTURE_MESSAGES, stepStops } from '../domain/index.ts'
import type { TimedEvent, TrackChapter } from '../domain/index.ts'
export default function ChapterList({
  chapters,
  events,
  time,
  onSeek,
}: {
  chapters: readonly TrackChapter[]
  events: readonly TimedEvent[]
  time: number
  onSeek(t: number): void
}) {
  const t = useMessages(LECTURE_MESSAGES)
  const entries = [
    ...chapters.map((c) => ({ ...c, step: undefined as number | undefined })),
    ...stepStops(events)
      .filter((s) => s.step > 0)
      .map((s) => ({ ...s, title: t.player.step(s.step) })),
  ].sort((a, b) => a.t - b.t)
  const current = entries.filter((e) => e.t <= time).at(-1)
  return (
    <ol className="pm-lecture-chapters">
      {entries.map((item, index) => (
        <li
          key={`${item.t}:${index}`}
          aria-current={current === item ? 'true' : undefined}
        >
          <button
            type="button"
            className={
              item.step === undefined
                ? 'pm-lecture-chapters__item'
                : 'pm-lecture-chapters__step'
            }
            data-section={item.section}
            data-step={item.step}
            onClick={() => onSeek(item.t)}
          >
            <span className="pm-lecture-chapters__time">
              {clockText(item.t)}
            </span>{' '}
            {item.title}
          </button>
        </li>
      ))}
    </ol>
  )
}
