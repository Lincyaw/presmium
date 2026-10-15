import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { ComponentNode, ComponentRenderer, DirectiveContext, DirectiveSpec } from '@presmium/kernel'
import { CONTENT_ID, isRemote, MEDIA_OPTIONS, mediaElements, mediaFallback, mediaHtml, mediaMdast, youtubeId } from '../domain/index.ts'
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

/**
 * `{video} path`, `{audio} path`, `{animation} path` (P-42). The block is a
 * `PmMedia` figure, the body its caption. Its child block holds the media
 * elements as images with their HTML element names (see `mediaMdast`), at
 * paths relative to the source file as images have, so the web renderer
 * publishes the files. `src` and `still` props are relative to the deck. An
 * online file, an `http(s)://` URL, stays as it is in every form.
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
      const find = (path: string | undefined) => (path && !isRemote(path) ? resolveMedia(path, ctx) : undefined)
      const found = { media: find(files.media), still: find(files.still) }
      if (!files.media) fail('needs the path or URL of the media file')
      for (const key of ['media', 'still'] as const) {
        if (files[key] && !isRemote(files[key]) && !found[key]) fail(`file not found: ${files[key]}`)
      }
      const path = (key: 'media' | 'still', from: string) => {
        const file = found[key]
        return file ? posix(relative(from, file)) : files[key] ?? ''
      }
      const { still: _still, ...options } = input.options
      const caption = input.body.trim()
      const elements = mediaElements(kind, options as MediaOptions, files.still !== undefined)
      const node: ComponentNode = {
        type: 'component',
        plugin: CONTENT_ID,
        name: 'PmMedia',
        props: {
          kind,
          src: path('media', ctx.deckDir),
          ...files.still ? { still: path('still', ctx.deckDir) } : {},
          ...options,
          ...caption ? { caption } : {},
        },
        children: [{
          id: 'media',
          role: 'visual',
          at: 0,
          source: ctx.source,
          node: { type: 'markdown', mdast: mediaMdast(elements, key => path(key, dirname(ctx.file))) },
        }],
        fallback: mediaFallback(path('media', dirname(ctx.file)), caption),
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

function attribute(name: string, value: unknown): string {
  return typeof value === 'string' && value ? ` ${name}="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"` : ''
}

/**
 * `PmMedia` in a Slidev slide: the media elements are written in the slide
 * itself, where Vue turns their relative `src` into bundled assets. The slides
 * renderer writes its Slidev deck to its work directory, so paths relative to
 * the deck are rewritten relative to that directory; online files stay as they are.
 */
export const slidesMedia: ComponentRenderer = (node, _block, ctx) => {
  const { kind, src, still, caption, ...options } = node.props as unknown as { kind: MediaKind, src: string, still?: string, caption?: string } & MediaOptions
  const elements = mediaElements(kind, options, still !== undefined)
  const fromSlides = (file: string) => (isRemote(file) ? file : posix(relative(ctx.workDir, join(ctx.deckDir, file))))
  const html = mediaHtml(elements, file => fromSlides(file === 'still' ? still ?? '' : src))
  return `<PmMedia${attribute('kind', kind)}${attribute('caption', caption)}>\n${html}\n</PmMedia>`
}
