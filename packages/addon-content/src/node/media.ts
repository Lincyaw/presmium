import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { ComponentNode, DirectiveContext, DirectiveSpec } from '@presmium/kernel'
import { CONTENT_ID, isRemote, MEDIA_OPTIONS, mediaFallback, youtubeId } from '../domain/index.ts'
import type { MediaKind } from '../domain/index.ts'

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

/**
 * `{video} path`, `{audio} path`, `{animation} path` (P-42). The block is a
 * `PmMedia` figure that draws the media elements, the body its caption. Its
 * `src` and `still` props name a local file relative to the source file and
 * are declared as `assets`, so each renderer publishes the file with its
 * output and sets the prop to the published URL. An online file, an
 * `http(s)://` URL, stays as it is in every form.
 */
export function mediaDirective(kind: MediaKind): DirectiveSpec {
  return {
    name: kind,
    arg: true,
    body: true,
    options: kind === 'animation' ? { ...MEDIA_OPTIONS, still: 'string' } : MEDIA_OPTIONS,
    toIR(input, ctx) {
      const fail = (message: string) => ctx.report({ checkId: CONTENT_ID, severity: 'error', message: `{${kind}}: ${message}` })
      const files = { media: input.arg?.trim(), still: typeof input.options.still === 'string' ? input.options.still.trim() : undefined }
      if (!files.media) fail('needs the path or URL of the media file')
      const urls: Partial<Record<'src' | 'still', string>> = {}
      const assets: Record<string, string> = {}
      for (const [key, prop] of [['media', 'src'], ['still', 'still']] as const) {
        const path = files[key]
        if (!path) continue
        if (isRemote(path)) {
          urls[prop] = path
          continue
        }
        const file = resolveMedia(path, ctx)
        if (!file) fail(`file not found: ${path}`)
        urls[prop] = assets[prop] = file ? posix(relative(dirname(ctx.file), file)) : path
      }
      const { still: _still, ...options } = input.options
      const caption = input.body.trim()
      const node: ComponentNode = {
        type: 'component',
        plugin: CONTENT_ID,
        name: 'PmMedia',
        props: { kind, src: urls.src ?? '', ...urls.still ? { still: urls.still } : {}, ...options, ...caption ? { caption } : {} },
        ...Object.keys(assets).length ? { assets } : {},
        fallback: mediaFallback(urls.src ?? '', caption),
      }
      return { node }
    },
  }
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
