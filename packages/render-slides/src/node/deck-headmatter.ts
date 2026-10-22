import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_LANG } from '@lincyaw/kernel'
import type { IRDocument, RenderContext } from '@lincyaw/kernel'
import { addonNames, addonPath, relativePath } from './deck-addons.ts'
import { liveRunOptions, monacoTypesSource } from './deck-live-code.ts'
import type { Generation } from './generation.ts'

const FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#0f5f5c"/></svg>')}`

/** The keys of the slides renderer's configuration that are its own, not Slidev's headmatter. */
const RENDERER_KEYS = new Set(['package', 'base', 'port', 'liveCode'])

const THEME_DIR = fileURLToPath(new URL('../../theme', import.meta.url))

export function deckLang(doc: IRDocument): string {
  return typeof doc.meta.lang === 'string' && doc.meta.lang ? doc.meta.lang : DEFAULT_LANG
}

/** The document a preview shows: its directory from the workspace's root. */
export function previewDocument(ctx: RenderContext): string {
  return relative(ctx.workspaceRoot, ctx.deckDir).split('\\').join('/')
}

/** The headmatter of the deck's first slide: Slidev's configuration, the addons and Presmium's settings for its plugins. */
export function headmatter(doc: IRDocument, gen: Generation): Record<string, unknown> {
  const { ctx } = gen
  const { theme, ...rest } = Object.fromEntries(Object.entries(ctx.config).filter(([key]) => !RENDERER_KEYS.has(key) && key !== 'addons'))
  const local = (name: unknown) => typeof name === 'string' && name.startsWith('.') ? resolve(ctx.deckDir, name) : name
  const { htmlAttrs, ...slidev } = rest
  return {
    theme: theme === undefined ? relativePath(gen.dir, THEME_DIR) : local(theme),
    title: doc.meta.title,
    favicon: FAVICON,
    ...monacoTypesSource(doc, gen),
    ...slidev,
    htmlAttrs: { lang: deckLang(doc), ...typeof htmlAttrs === 'object' ? htmlAttrs : {} },
    addons: [...new Set(addonNames(doc, ctx).map(name => addonPath(name, ctx, gen.dir)))],
    presmium: ctx.portable(doc.config.presmium, gen.dir),
    mcp: false,
    ...ctx.server || ctx.preview ? { presmiumServer: true } : {},
    ...ctx.preview ? { presmiumDocument: previewDocument(ctx) } : {},
    ...doc.config.execute?.environments ? { presmiumEnvironments: ctx.portable(doc.config.execute.environments, gen.dir) } : {},
    ...liveRunOptions(doc, gen),
  }
}
