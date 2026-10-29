import { deckLocale, isRecord } from '@lincyaw/kernel'
import { WEB_MESSAGES } from './messages.ts'

export interface SiteAction { text: string, link: string, variant?: 'primary' | 'secondary' }
export interface SiteHero { eyebrow?: string, title: string, description?: string, image?: string, imageAlt?: string, actions?: SiteAction[] }
interface SiteSection { id: string, title?: string, description?: string }
export type SiteLandingSection =
  | SiteSection & { type: 'features', items: { title: string, description?: string, image?: string, imageAlt?: string, link?: string }[] }
  | SiteSection & { type: 'documents', tags?: string[], directories?: string[] }
  | SiteSection & { type: 'media', kind: 'image' | 'video', src: string, alt?: string, poster?: string, captions?: Record<string, string> }
  | SiteSection & { type: 'text', body: string }
  | SiteSection & { type: 'cta', title: string, actions: SiteAction[] }

/** Website content is independent of teaching documents and may reference their published collection. */
export interface SiteLandingPage { schemaVersion: 1, title: string, description?: string, hero?: SiteHero, sections: SiteLandingSection[] }

export interface SiteContentDocument { id: string, title: string, href: string, description?: string, lang?: string, tags?: string[], pages?: number }
export interface SiteContent { schemaVersion: 1, title: string, base: string, lang: string, documents: SiteContentDocument[] }
export const SITE_CONTENT_ELEMENT = 'presmium-site-data'

/** One validator for inline definitions and JSON files, used before replacing an existing build. */
export function parseLandingPage(value: unknown, lang?: string): SiteLandingPage {
  const fail = (path: string): never => { throw new Error(WEB_MESSAGES[deckLocale(lang)].invalidSiteParameter(path)) }
  const record = (item: unknown, path: string): Record<string, unknown> => isRecord(item) ? item : fail(path)
  const text = (item: unknown, path: string): string => typeof item === 'string' && item.trim() ? item.trim() : fail(path)
  const optional = (item: unknown, path: string): string | undefined => item === undefined ? undefined : typeof item === 'string' ? item : fail(path)
  const url = (item: unknown, path: string): string => {
    const result = text(item, path)
    if (/^(?:javascript|vbscript|data):/i.test(result)) fail(path)
    return result
  }
  const strings = (item: unknown, path: string): string[] | undefined => item === undefined ? undefined : Array.isArray(item) ? item.map((word, i) => text(word, `${path}.${i}`)) : fail(path)
  const actions = (item: unknown, path: string): SiteAction[] => {
    if (!Array.isArray(item)) return fail(path)
    return item.map((input, i) => {
      const action = record(input, `${path}.${i}`)
      if (action.variant !== undefined && action.variant !== 'primary' && action.variant !== 'secondary') fail(`${path}.${i}.variant`)
      return { text: text(action.text, `${path}.${i}.text`), link: url(action.link, `${path}.${i}.link`), ...action.variant ? { variant: action.variant as SiteAction['variant'] } : {} }
    })
  }
  const input = record(value, 'site.landing')
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) fail('site.landing.schemaVersion')
  const page: SiteLandingPage = { schemaVersion: 1, title: text(input.title, 'site.landing.title'), description: optional(input.description, 'site.landing.description'), sections: [] }
  if (input.hero !== undefined) {
    const hero = record(input.hero, 'site.landing.hero')
    page.hero = {
      title: text(hero.title, 'site.landing.hero.title'),
      eyebrow: optional(hero.eyebrow, 'site.landing.hero.eyebrow'),
      description: optional(hero.description, 'site.landing.hero.description'),
      image: hero.image === undefined ? undefined : url(hero.image, 'site.landing.hero.image'),
      imageAlt: optional(hero.imageAlt, 'site.landing.hero.imageAlt'),
      actions: hero.actions === undefined ? undefined : actions(hero.actions, 'site.landing.hero.actions'),
    }
  }
  if (!Array.isArray(input.sections)) fail('site.landing.sections')
  const ids = new Set<string>()
  page.sections = (input.sections as unknown[]).map((item, i): SiteLandingSection => {
    const at = `site.landing.sections.${i}`, section = record(item, at)
    const id = text(section.id, `${at}.id`)
    if (ids.has(id) || /\s/.test(id) || id === 'pm-site-main') fail(`${at}.id`)
    ids.add(id)
    const common: SiteSection = { id, title: optional(section.title, `${at}.title`), description: optional(section.description, `${at}.description`) }
    switch (section.type) {
      case 'text': return { ...common, type: 'text', body: text(section.body, `${at}.body`) }
      case 'cta': return { ...common, type: 'cta', title: text(section.title, `${at}.title`), actions: actions(section.actions, `${at}.actions`) }
      case 'documents': return { ...common, type: 'documents', tags: strings(section.tags, `${at}.tags`), directories: strings(section.directories, `${at}.directories`) }
      case 'features': {
        if (!Array.isArray(section.items)) fail(`${at}.items`)
        return { ...common, type: 'features', items: (section.items as unknown[]).map((item, j) => {
          const feature = record(item, `${at}.items.${j}`)
          return { title: text(feature.title, `${at}.items.${j}.title`), description: optional(feature.description, `${at}.items.${j}.description`), image: feature.image === undefined ? undefined : url(feature.image, `${at}.items.${j}.image`), imageAlt: optional(feature.imageAlt, `${at}.items.${j}.imageAlt`), link: feature.link === undefined ? undefined : url(feature.link, `${at}.items.${j}.link`) }
        }) }
      }
      case 'media': {
        if (section.kind !== 'image' && section.kind !== 'video') fail(`${at}.kind`)
        const captions = section.captions === undefined ? undefined : Object.fromEntries(Object.entries(record(section.captions, `${at}.captions`)).map(([lang, file]) => [lang, url(file, `${at}.captions.${lang}`)]))
        return { ...common, type: 'media', kind: section.kind as 'image' | 'video', src: url(section.src, `${at}.src`), alt: optional(section.alt, `${at}.alt`), poster: section.poster === undefined ? undefined : url(section.poster, `${at}.poster`), captions }
      }
      default: return fail(`${at}.type`)
    }
  })
  return page
}
