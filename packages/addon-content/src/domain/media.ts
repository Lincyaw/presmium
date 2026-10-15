import type { MdastNode } from '@presmium/kernel'

/**
 * Media directives (P-42): `{video}`, `{audio}` and `{animation}` (an
 * animated image, with a still image shown instead when the system asks for
 * reduced motion).
 */
export type MediaKind = 'video' | 'audio' | 'animation'

export const MEDIA_KINDS: readonly MediaKind[] = ['video', 'audio', 'animation']

/** Directive options; booleans are attributes that are present or absent, sizes are CSS pixels. */
export interface MediaOptions {
  controls?: boolean
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  width?: number
  height?: number
  alt?: string
}

export const MEDIA_OPTIONS = { controls: 'boolean', autoplay: 'boolean', loop: 'boolean', muted: 'boolean', width: 'number', height: 'number', alt: 'string' } as const

/** One element that shows the media; `file` says which file is its source. */
export interface MediaElement {
  tag: 'video' | 'audio' | 'img'
  file: 'media' | 'still'
  /** HTML attributes besides `src`; `true` is a boolean attribute. */
  attrs: Record<string, string | number | true>
}

/** The elements of a media block: the media itself, and the still image of an animation. */
export function mediaElements(kind: MediaKind, options: MediaOptions, still: boolean): MediaElement[] {
  const size: Record<string, number> = {}
  for (const key of ['width', 'height'] as const) {
    const value = options[key]
    if (typeof value === 'number' && value > 0) size[key] = value
  }
  const flags = (names: (keyof MediaOptions)[]) => Object.fromEntries(names.filter(name => options[name] === true).map(name => [name, true as const]))
  if (kind === 'video') {
    // Autoplay is allowed only without sound and inline on phones.
    const autoplay: Record<string, true> = options.autoplay ? { muted: true, playsinline: true } : {}
    return [{ tag: 'video', file: 'media', attrs: { ...flags(['controls', 'autoplay', 'loop', 'muted']), ...autoplay, preload: 'metadata', ...size } }]
  }
  if (kind === 'audio') return [{ tag: 'audio', file: 'media', attrs: { ...flags(['controls', 'autoplay', 'loop']), preload: 'metadata' } }]
  const alt = { alt: options.alt ?? '' }
  if (!still) return [{ tag: 'img', file: 'media', attrs: { ...alt, ...size } }]
  return [
    { tag: 'img', file: 'media', attrs: { class: 'pm-media-motion', ...alt, ...size } },
    { tag: 'img', file: 'still', attrs: { class: 'pm-media-still', ...alt, ...size } },
  ]
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * The elements as HTML, each source given by `src`. Audio names its file in a
 * `<source>`: that is where Vue's templates (Slidev) turn a relative URL into a
 * bundled asset, as they do for `<video src>` and `<img src>`.
 */
export function mediaHtml(elements: MediaElement[], src: (file: MediaElement['file']) => string): string {
  return elements.map(({ tag, file, attrs }) => {
    const list = Object.entries(attrs).map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escape(String(value))}"`)).join('')
    const url = escape(src(file))
    if (tag === 'img') return `<img src="${url}"${list}>`
    return tag === 'audio' ? `<audio${list}><source src="${url}"></audio>` : `<${tag} src="${url}"${list}></${tag}>`
  }).join('\n')
}

/**
 * The elements as mdast: image nodes whose `data.hName` makes them the media
 * element in HTML (mdast-util-to-hast), so renderers that publish the local
 * images of the IR publish the media files too.
 */
export function mediaMdast(elements: MediaElement[], url: (file: MediaElement['file']) => string): MdastNode {
  return {
    type: 'root',
    children: elements.map(({ tag, file, attrs }) => {
      const { class: className, alt, ...rest } = attrs
      return {
        type: 'image',
        url: url(file),
        alt: typeof alt === 'string' ? alt : null,
        data: { hName: tag, hProperties: { ...rest, ...className === undefined ? {} : { className: [String(className)] } } },
      }
    }),
  }
}

/** Static content for renderers without the media element (a notebook, an export): a link to the file, named by the caption or the file name. */
export function mediaFallback(url: string, caption?: string): MdastNode {
  const name = caption || url.split(/[?#]/)[0]!.split('/').pop() || url
  return { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'link', url, children: [{ type: 'text', value: name }] }] }] }
}

/** An online media file: an `http(s)://` URL, which the media directives use as it is. */
export function isRemote(path: string): boolean {
  return /^https?:\/\//i.test(path)
}

const YOUTUBE_ID = /^[\w-]{11}$/

/**
 * The id of a YouTube video, from the id itself or a link to the video
 * (`youtube.com/watch?v=`, `youtu.be/`, `youtube.com/embed/`, `youtube.com/shorts/`).
 */
export function youtubeId(value: string): string | undefined {
  const text = value.trim()
  if (YOUTUBE_ID.test(text)) return text
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return undefined
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '')
  const id = host === 'youtu.be'
    ? url.pathname.slice(1)
    : /^youtube(-nocookie)?\.com$/.test(host)
      ? url.searchParams.get('v') ?? /^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname)?.[1]
      : undefined
  return id && YOUTUBE_ID.test(id) ? id : undefined
}
