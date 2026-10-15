import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { ComponentNode, DirectiveContext, DirectiveSpec } from '@presmium/kernel'
import { SLIDEV_DIR } from '@presmium/render-slides/presmium'
import { CONTENT_ID, MEDIA_OPTIONS, mediaElements, mediaFallback, mediaHtml, mediaMdast } from '../domain/index.ts'
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
 * publishes the files. `src` and `still` props are relative to the deck.
 */
export function mediaDirective(kind: MediaKind): DirectiveSpec {
  return {
    name: kind,
    arg: true,
    body: true,
    options: kind === 'animation' ? { ...MEDIA_OPTIONS, still: 'string' } : MEDIA_OPTIONS,
    toIR(input, ctx) {
      const fail = (message: string) => ctx.report({ checkId: CONTENT_ID, severity: 'error', message: `{${kind}}: ${message}` })
      const files = { media: input.arg, still: typeof input.options.still === 'string' ? input.options.still : undefined }
      const found = { media: files.media && resolveMedia(files.media, ctx), still: files.still && resolveMedia(files.still, ctx) }
      if (!files.media) fail('needs the path of the media file')
      for (const key of ['media', 'still'] as const) {
        if (files[key] && !found[key]) fail(`file not found: ${files[key]}`)
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
        fallback: mediaFallback(kind, path('media', dirname(ctx.file)), caption),
      }
      return { node }
    },
  }
}

/** From the Slidev deck that the slides renderer writes inside the deck back to the deck. */
const DECK_FROM_SLIDES = posix(relative(join(sep, SLIDEV_DIR), sep))

function attribute(name: string, value: unknown): string {
  return typeof value === 'string' && value ? ` ${name}="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"` : ''
}

/**
 * `PmMedia` in a Slidev slide: the media elements are written in the slide
 * itself, where Vue turns their relative `src` into bundled assets.
 */
export function slidesMedia(node: ComponentNode): string {
  const { kind, src, still, caption, ...options } = node.props as unknown as { kind: MediaKind, src: string, still?: string, caption?: string } & MediaOptions
  const elements = mediaElements(kind, options, still !== undefined)
  const html = mediaHtml(elements, file => `${DECK_FROM_SLIDES}/${file === 'still' ? still : src}`)
  return `<PmMedia${attribute('kind', kind)}${attribute('caption', caption)}>\n${html}\n</PmMedia>`
}
