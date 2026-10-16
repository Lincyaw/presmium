import type { MdastNode } from '@presmium/kernel'

/**
 * Media directives (P-42): `{video}`, `{audio}` and `{animation}` (an
 * animated image, with a still image shown instead when the system asks for
 * reduced motion). `PmMedia` draws the elements of `mediaElements`; a video
 * may have a poster and caption tracks in several languages.
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

/**
 * A caption track of a video (docs/ir.md 2.14): its language, its file, its
 * label (the language's name) and whether it shows without being chosen.
 */
export interface CaptionTrack {
  srclang: string
  src: string
  label: string
  default: boolean
}

/**
 * `:captions: en=films/loop.en.vtt, zh-CN=films/loop.zh.vtt`: language to
 * file, in the order written; `invalid` holds the entries that are not
 * `<language tag>=<file>`.
 */
export function parseCaptions(value: string): { captions: Record<string, string>, invalid: string[] } {
  const captions: Record<string, string> = {}
  const invalid: string[] = []
  for (const entry of value.split(',').map(part => part.trim()).filter(Boolean)) {
    const [lang = '', ...file] = entry.split('=')
    const tag = languageTag(lang.trim())
    const path = file.join('=').trim()
    if (tag && path) captions[tag] = path
    else invalid.push(entry)
  }
  return { captions, invalid }
}

/** The canonical form of a BCP 47 language tag (`zh-cn` gives `zh-CN`); undefined when it is none. */
export function languageTag(value: string): string | undefined {
  try {
    return value ? Intl.getCanonicalLocales(value)[0] : undefined
  } catch {
    return undefined
  }
}

/** The name of a language in the language `locale` (`en` in `zh-CN` is 英语); the tag itself where it has none. */
export function languageName(lang: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(lang) ?? lang
  } catch {
    return lang
  }
}

/** The tracks of a video's captions, labelled in `locale`; the language `chosen` shows by default. */
export function captionTracks(captions: Record<string, string> | undefined, chosen: string | undefined, locale: string): CaptionTrack[] {
  return Object.entries(captions ?? {}).map(([srclang, src]) => ({ srclang, src, label: languageName(srclang, locale), default: srclang === chosen }))
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** HTML attributes: a value, or the name alone for `true`. */
function htmlAttributes(attrs: Record<string, string | number | true | undefined>): string {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`))
    .join('')
}

/**
 * A video with its poster and caption tracks as HTML, for a renderer that
 * writes HTML rather than running the component (the notebook): the element
 * `PmMedia` draws, and its caption.
 */
export function videoHtml(video: { src: string, poster?: string, tracks: CaptionTrack[], caption?: string, options: MediaOptions }): string {
  const [element] = mediaElements('video', video.options, false)
  const tracks = video.tracks.map(track => `<track${htmlAttributes({ kind: 'captions', src: track.src, srclang: track.srclang, label: track.label, default: track.default || undefined })}>`)
  const lines = ['<figure>', `<video${htmlAttributes({ ...element!.attrs, src: video.src, poster: video.poster })}>`, ...tracks, '</video>']
  if (video.caption) lines.push(`<figcaption>${escapeHtml(video.caption)}</figcaption>`)
  return [...lines, '</figure>'].join('\n')
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
