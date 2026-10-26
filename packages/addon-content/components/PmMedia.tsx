import { PmNotice, useLocale, useMessages } from '@lincyaw/host'
import { createElement, useRef } from 'react'
import { useMediaPlayback } from '../src/client/media.ts'
import { captionTracks, mediaElements, MESSAGES } from '../src/domain/index.ts'
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
    t = useMessages(MESSAGES),
    figure = useRef<HTMLElement>(null),
    failed = useMediaPlayback(figure, `${props.kind}\0${props.src}`)
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
      {failed && <PmNotice tone="danger">{t.mediaPlaybackFailed}</PmNotice>}
    </figure>
  )
}
