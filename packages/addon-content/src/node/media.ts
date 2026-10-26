import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { deckLocale, docBlocks, isRecord, NON_FILE_URL } from '@lincyaw/kernel'
import type { ComponentNode, DirectiveContext, DirectiveSpec, IRBlock, IRPass, RenderContext } from '@lincyaw/kernel'
import { captionTracks, CONTENT_ID, isRemote, languageTag, MEDIA_OPTIONS, mediaFallback, parseCaptions, videoHtml, youtubeId } from '../domain/index.ts'
import type { MediaKind, MediaOptions } from '../domain/index.ts'

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

/** Resource paths belong to the actual media parameters, including step overrides. */
function mediaAssets(props: Record<string, unknown>): Record<string, string> {
  const assets: Record<string, string> = {}
  for (const key of ['src', 'poster', 'still']) if (typeof props[key] === 'string' && props[key]) assets[key] = props[key]
  if (isRecord(props.captions)) for (const [lang, value] of Object.entries(props.captions)) if (typeof value === 'string' && value) assets[`captions.${lang}`] = value
  return assets
}

export const mediaAssetsPass: IRPass = {
  name: 'presmium.content.media-assets',
  run(doc, ctx) {
    for (const { block } of docBlocks(doc)) {
      const { node } = block
      if (node.type !== 'component' || node.plugin !== CONTENT_ID || node.name !== 'PmMedia') continue
      node.assets = mediaAssets(node.props)
      for (const state of block.stepStates ?? []) state.assets = mediaAssets(state.parameters ?? node.props)
      const urls = new Set([node.assets, ...(block.stepStates ?? []).map(state => state.assets)].flatMap(assets => Object.values(assets ?? {})))
      for (const url of urls) {
        if (NON_FILE_URL.test(url)) continue
        let file = url.replace(/[?#].*$/s, '')
        try { file = decodeURIComponent(file) } catch {}
        if (file) ctx.watch(file.startsWith('/') ? join(ctx.deckDir, 'public', file) : resolve(dirname(block.source.file), file))
      }
    }
  },
}

const FILE_OPTIONS = {
  video: { 'poster': 'string', 'captions': 'string', 'captions-default': 'string' },
  audio: {},
  animation: { still: 'string' },
} as const

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

export function notebookMedia(node: ComponentNode, _block: IRBlock, ctx: RenderContext): unknown {
  const { kind, src, poster, captions, captionsDefault, caption, ...options } = node.props
  if (kind !== 'video' || (!poster && !captions)) return undefined
  const tracks = captionTracks(captions as Record<string, string> | undefined, captionsDefault as string | undefined, deckLocale(ctx.lang))
  const html = videoHtml({ src: String(src), poster: poster as string | undefined, tracks, caption: caption as string | undefined, options: options as MediaOptions })
  return { cell_type: 'markdown', source: html }
}

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
