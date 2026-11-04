import { dirname, join, resolve } from 'node:path'
import { deckLocale, docBlocks, isRecord, NON_FILE_URL } from '@lincyaw/kernel'
import type { ComponentNode, IRBlock, IRPass, RenderContext } from '@lincyaw/kernel'
import { captionTracks, CONTENT_ID, videoHtml } from '../domain/index.ts'
import type { MediaOptions } from '../domain/index.ts'

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

export function notebookMedia(node: ComponentNode, _block: IRBlock, ctx: RenderContext): unknown {
  const { kind, src, poster, captions, captionsDefault, caption, ...options } = node.props
  if (kind !== 'video' || (!poster && !captions)) return undefined
  const tracks = captionTracks(captions as Record<string, string> | undefined, captionsDefault as string | undefined, deckLocale(ctx.lang))
  const html = videoHtml({ src: String(src), poster: poster as string | undefined, tracks, caption: caption as string | undefined, options: options as MediaOptions })
  return { cell_type: 'markdown', source: html }
}
