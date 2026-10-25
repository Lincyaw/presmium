import { useLocale } from '@lincyaw/host'
import { createElement, useEffect, useRef } from 'react'
import { useMediaActive } from '../src/client/media.ts'
import { captionTracks, mediaElements } from '../src/domain/index.ts'
import type { MediaKind } from '../src/domain/index.ts'
import './PmMedia.css'
interface Props {
  kind: MediaKind
  src: string
  still?: string
  poster?: string
  captions?: Record<string, string>
  captionsDefault?: string
  caption?: string
  controls?: boolean
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  width?: number
  height?: number
  alt?: string
}
export default function PmMedia(props: Props) {
  const locale = useLocale(),
    figure = useRef<HTMLElement>(null),
    active = useMediaActive(),
    resume = useRef(false)
  useEffect(() => {
    const media = [
      ...(figure.current?.querySelectorAll<HTMLMediaElement>('video,audio') ??
        []),
    ]
    if (!active) {
      resume.current =
        props.autoplay === true && media.some((el) => !el.paused && !el.ended)
      media.forEach((el) => el.pause())
    } else if (resume.current && props.autoplay) {
      resume.current = false
      media.forEach((el) => void el.play().catch(() => {}))
    }
  }, [active, props.autoplay])
  useEffect(
    () => () =>
      figure.current
        ?.querySelectorAll<HTMLMediaElement>('video,audio')
        .forEach((el) => el.pause()),
    [],
  )
  const elements = mediaElements(props.kind, props, props.still !== undefined),
    tracks =
      props.kind === 'video'
        ? captionTracks(props.captions, props.captionsDefault, locale)
        : []
  return (
    <figure
      ref={figure}
      className="pm-media"
      data-kind={props.kind}
      onPlayCapture={(event) => {
        if (!active && event.target instanceof HTMLMediaElement) {
          resume.current = props.autoplay === true
          event.target.pause()
        }
      }}
    >
      {elements.map(({ tag, file, attrs }, i) => {
        const {
          class: className,
          autoplay: autoPlay,
          playsinline: playsInline,
          ...rest
        } = attrs
        return createElement(
          tag,
          {
            ...rest,
            className,
            autoPlay,
            playsInline,
            src: file === 'still' ? props.still : props.src,
            ...(tag === 'video' && props.poster
              ? { poster: props.poster }
              : {}),
            key: i,
          },
          tag === 'video'
            ? tracks.map((track) => (
                <track
                  key={track.srclang}
                  kind="captions"
                  src={track.src}
                  srcLang={track.srclang}
                  label={track.label}
                  default={track.default}
                />
              ))
            : undefined,
        )
      })}
      {props.caption && <figcaption>{props.caption}</figcaption>}
    </figure>
  )
}
