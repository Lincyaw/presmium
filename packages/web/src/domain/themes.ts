import { deckLocale, isRecord } from '@lincyaw/kernel'
import { WEB_MESSAGES } from './messages.ts'

export const SITE_THEME_IDS = ['course', 'docs', 'showcase'] as const
export type SiteThemeId = typeof SITE_THEME_IDS[number]
export type SitePageLayout = 'article' | 'landing' | 'wide'

/** Public presentation options; the content and its stable identities stay in lecture.json. */
export interface SiteThemeParams {
  accent: 'blue' | 'teal' | 'violet' | 'amber'
  typography: 'reading' | 'sans'
  contentWidth: 'comfortable' | 'wide'
  logo?: string
  logoAlt?: string
}

export interface SiteTheme {
  id: SiteThemeId
  params: SiteThemeParams
}

export const SITE_THEMES: Readonly<Record<SiteThemeId, Readonly<SiteThemeParams>>> = {
  docs: { accent: 'teal', typography: 'reading', contentWidth: 'comfortable' },
  course: { accent: 'teal', typography: 'reading', contentWidth: 'comfortable' },
  showcase: { accent: 'violet', typography: 'sans', contentWidth: 'wide' },
}

/** Resolve and validate the same configuration in builds, dev servers and independent documents. */
export function siteTheme(config: Record<string, unknown>, lang?: string): SiteTheme {
  const t = WEB_MESSAGES[deckLocale(lang)]
  const id = config.theme ?? 'docs'
  if (!SITE_THEME_IDS.includes(id as SiteThemeId)) throw new Error(t.unknownTheme(String(id)))
  const defaults = SITE_THEMES[id as SiteThemeId]
  if (config.params !== undefined && !isRecord(config.params)) throw new Error(t.invalidSiteParameter('site.params'))
  const input = isRecord(config.params) ? config.params : {}
  const choice = <T extends string>(key: string, values: readonly T[], fallback: T): T => {
    const value = input[key]
    if (value === undefined) return fallback
    if (!values.includes(value as T)) throw new Error(t.invalidSiteParameter(`site.params.${key}`))
    return value as T
  }
  const params: SiteThemeParams = {
    accent: choice('accent', ['blue', 'teal', 'violet', 'amber'], defaults.accent),
    typography: choice('typography', ['reading', 'sans'], defaults.typography),
    contentWidth: choice('contentWidth', ['comfortable', 'wide'], defaults.contentWidth),
  }
  for (const key of ['logo', 'logoAlt'] as const) {
    if (input[key] === undefined) continue
    if (typeof input[key] !== 'string' || key === 'logo' && !input[key].trim()) throw new Error(t.invalidSiteParameter(`site.params.${key}`))
    params[key] = input[key].trim()
  }
  return { id: id as SiteThemeId, params }
}

export function sitePageLayout(config: Record<string, unknown>, lang?: string): SitePageLayout {
  const value = config.layout ?? 'article'
  if (!['article', 'landing', 'wide'].includes(value as string)) throw new Error(WEB_MESSAGES[deckLocale(lang)].invalidSiteParameter('renderers.web.layout'))
  return value as SitePageLayout
}
