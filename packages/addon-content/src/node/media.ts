import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { deckLocale } from '@presmium/kernel'
import type { ComponentNode, DirectiveContext, DirectiveSpec, IRBlock, RenderContext } from '@presmium/kernel'
import { captionTracks, CONTENT_ID, isRemote, languageTag, MEDIA_OPTIONS, mediaFallback, parseCaptions, videoHtml, youtubeId } from '../domain/index.ts'
import type { MediaKind, MediaOptions } from '../domain/index.ts'

/**
 * A media file named in the deck: a path relative to the source file, or a
 * package path such as `@org/pkg/media/clip.webm` resolved from the deck.
 */
function resolveMedia(path: string, ctx: DirectiveContext): string | undefined {
  const file = resolve(dirname(ctx.file), path)
  if (existsSync(file) || path.startsWith('.') || isAbsolute(path)) return existsSync(file) ? file : undefined
  try {
    return createRequire(join(ctx.deckDir, 'package.json')).resolve(path)
  } catch {
    return undefined
  }
}

const posix = (path: string) => path.split(sep).join('/')

/** Options of each media directive besides `MEDIA_OPTIONS`: files are strings, read below. */
const FILE_OPTIONS = {
  video: { 'poster': 'string', 'captions': 'string', 'captions-default': 'string' },
  audio: {},
  animation: { still: 'string' },
} as const

/**
 * `{video} path`, `{audio} path`, `{animation} path` (P-42). The block is a
 * `PmMedia` figure that draws the media elements, the body its caption. A
 * video's `:poster:` is its cover image, its `:captions:` caption tracks
 * (`en=a.vtt, zh-CN=b.vtt`), `:captions-default:` the language shown at
 * first (docs/ir.md 2.14). Each local file is relative to the source file
 * (or a package path) and declared in `assets` by its prop's path (`src`,
 * `still`, `poster`, `captions.<language>`), so each renderer publishes the
 * file with its output and sets the prop to the published URL; a file that
 * does not exist is an error on the directive's line. An online file, an
 * `http(s)://` URL, stays as it is in every form.
 */
export function mediaDirective(kind: MediaKind): DirectiveSpec {
  return {
    name: kind,
    arg: true,
    body: true,
    options: { ...MEDIA_OPTIONS, ...FILE_OPTIONS[kind] },
    toIR(input, ctx) {
      const report = (severity: 'error' | 'warning', message: string) => ctx.report({ checkId: CONTENT_ID, severity, message: `{${kind}}: ${message}` })
      const option = (name: string) => (typeof input.options[name] === 'string' ? (input.options[name] as string).trim() : undefined)
      const media = input.arg?.trim()
      if (!media) report('error', 'needs the path or URL of the media file')
      const assets: Record<string, string> = {}
      /** The URL of a file a prop names: an online file as it is, a local one relative to the source file, declared in `assets`. */
      const url = (path: string, prop: string) => {
        if (isRemote(path)) return path
        const file = resolveMedia(path, ctx)
        if (!file) report('error', `file not found: ${path}`)
        return assets[prop] = file ? posix(relative(dirname(ctx.file), file)) : path
      }
      const props: Record<string, unknown> = { kind, src: media ? url(media, 'src') : '' }
      const still = option('still')
      if (still) props.still = url(still, 'still')
      const poster = option('poster')
      if (poster) props.poster = url(poster, 'poster')
      const { captions, invalid } = parseCaptions(option('captions') ?? '')
      for (const entry of invalid) report('error', `:captions: "${entry}" is not <language>=<file>, e.g. en=films/loop.en.vtt`)
      if (Object.keys(captions).length) props.captions = Object.fromEntries(Object.entries(captions).map(([lang, path]) => [lang, url(path, `captions.${lang}`)]))
      const chosen = option('captions-default')
      const shown = chosen && Object.keys(captions).find(lang => lang === languageTag(chosen))
      if (chosen && !shown) report('warning', `:captions-default: ${chosen} is not a language of :captions:; no captions show at first`)
      if (shown) props.captionsDefault = shown
      const { still: _still, 'poster': _poster, 'captions': _captions, 'captions-default': _default, ...options } = input.options
      const caption = input.body.trim()
      const node: ComponentNode = {
        type: 'component',
        plugin: CONTENT_ID,
        name: 'PmMedia',
        props: { ...props, ...options, ...caption ? { caption } : {} },
        ...Object.keys(assets).length ? { assets } : {},
        fallback: mediaFallback(String(props.src), caption),
      }
      return { node }
    },
  }
}

/**
 * A video with a poster or captions in a notebook (docs/ir.md 2.14): the
 * `<video>` with its `<track>`s as HTML, the tracks labelled in the deck's
 * language. The renderer has copied the files to the notebook's `media/` and
 * set the props to the copies. Other media keep their fallback, a link to
 * the file.
 */
export function notebookMedia(node: ComponentNode, _block: IRBlock, ctx: RenderContext): unknown {
  const { kind, src, poster, captions, captionsDefault, caption, ...options } = node.props
  if (kind !== 'video' || (!poster && !captions)) return undefined
  const tracks = captionTracks(captions as Record<string, string> | undefined, captionsDefault as string | undefined, deckLocale(ctx.lang))
  const html = videoHtml({ src: String(src), poster: poster as string | undefined, tracks, caption: caption as string | undefined, options: options as MediaOptions })
  return { cell_type: 'markdown', source: html }
}

/**
 * ```` ```{youtube} <video id or link> ```` (P-42): a YouTube video in an
 * iframe, `PmYoutube`, in both forms; the body is its caption, `:start:` the
 * second it starts at. Renderers without it (a notebook, an export) link to the video.
 */
export const youtubeDirective: DirectiveSpec = {
  name: 'youtube',
  arg: true,
  body: true,
  options: { start: 'number', width: 'number', height: 'number' },
  toIR(input, ctx) {
    const id = youtubeId(input.arg ?? '')
    if (!id) ctx.report({ checkId: CONTENT_ID, severity: 'error', message: `{youtube}: "${input.arg ?? ''}" is no YouTube video id or link` })
    const caption = input.body.trim()
    const sizes = Object.fromEntries(['start', 'width', 'height'].flatMap(key => (typeof input.options[key] === 'number' && (input.options[key] as number) > 0 ? [[key, input.options[key]]] : [])))
    const url = `https://www.youtube.com/watch?v=${id ?? ''}`
    return {
      node: {
        type: 'component',
        plugin: CONTENT_ID,
        name: 'PmYoutube',
        props: { id: id ?? '', ...sizes, ...caption ? { caption } : {} },
        fallback: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'link', url, children: [{ type: 'text', value: caption || url }] }] }] },
      },
    }
  },
}
