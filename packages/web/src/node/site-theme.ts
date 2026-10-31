import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { deckLocale, isRecord } from '@lincyaw/kernel'
import type { RenderContext, SiteSpec } from '@lincyaw/kernel'
import { findInstalledPackage } from '@lincyaw/kernel/node'
import { isThemeReference, SITE_THEME_IDS, WEB_MESSAGES } from '../domain/index.ts'
import type { SiteThemeId } from '../domain/index.ts'
import { isSingle, siteLanguage } from './site-model.ts'

/**
 * A site theme of the workspace's own (`site.theme: ./theme`, or an installed package): a directory with `theme.json`.
 * It extends a built-in theme (its layouts and defaults), sets the theme's parameters, overrides design tokens for the
 * light and the dark appearance, and adds web fonts and stylesheets. Its files are published below `_theme/<name>/`;
 * every page of the site links them after the app's styles and carries `data-pm-site-theme-name`.
 */

export const THEME_FILE = 'theme.json'
export const THEME_DIR = '_theme'
const TOKENS_FILE = 'presmium-tokens.css'

export interface ThemeManifest {
  name: string
  extends: SiteThemeId
  params: Record<string, unknown>
  /** Token name (without `--pm-`) to value; those the dark appearance overrides (colors, shadows) are the light ones. */
  tokens: Record<string, string>
  /** Values for the dark appearance, of the tokens it overrides (colors, shadows). */
  dark: Record<string, string>
  /** Stylesheets of web fonts (`https:` URLs). */
  fonts: string[]
  /** The theme's own stylesheets, relative to its directory. */
  styles: string[]
}

export interface LoadedTheme {
  dir: string
  file: string
  manifest: ThemeManifest
}

let designTokens: { all: Set<string>, mode: Set<string> } | undefined
/** The design system's token names, without `--pm-`: what a theme may set, and those the dark appearance overrides. */
function tokenNames(): { all: Set<string>, mode: Set<string> } {
  if (designTokens) return designTokens
  const css = readFileSync(createRequire(import.meta.url).resolve('@lincyaw/design/tokens.css'), 'utf8')
  const names = (text: string) => [...text.matchAll(/--pm-([a-z0-9-]+)\s*:/g)].map(match => match[1]!)
  const dark = [...css.matchAll(/:root\.dark\s*\{([^}]*)\}/g)].flatMap(match => names(match[1]!))
  designTokens = { all: new Set(names(css)), mode: new Set(dark) }
  return designTokens
}

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/
// A value stays inside its declaration: no other declaration, rule or markup.
const VALUE = /^[^;{}<>\\]+$/

/** The directory `ref` names, from `from`: a path (`./theme`), else an installed package with `theme.json`. */
function themeDirectory(ref: string, from: string, lang: string): string {
  const t = WEB_MESSAGES[deckLocale(lang)]
  let dir: string | undefined
  if (ref.startsWith('.') || isAbsolute(ref)) dir = resolve(from, ref)
  else {
    const pkg = findInstalledPackage(ref, from)
    if (pkg) {
      const own = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as { presmium?: { theme?: unknown } }
      dir = typeof own.presmium?.theme === 'string' ? resolve(pkg, own.presmium.theme) : pkg
    }
  }
  if (!dir || !existsSync(join(dir, THEME_FILE))) throw new Error(t.unknownTheme(ref))
  return dir
}

const loaded = new Map<string, { at: number, theme: LoadedTheme }>()

export function loadTheme(ref: string, from: string, lang: string): LoadedTheme {
  const dir = themeDirectory(ref, from, lang)
  const file = join(dir, THEME_FILE)
  const at = statSync(file).mtimeMs
  const known = loaded.get(file)
  if (known?.at === at) return known.theme
  const t = WEB_MESSAGES[deckLocale(lang)]
  const fail = (field: string): never => { throw new Error(t.invalidTheme(file, field)) }
  let input: unknown
  try { input = JSON.parse(readFileSync(file, 'utf8')) } catch { fail('JSON') }
  if (!isRecord(input)) return fail('JSON')
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) fail('schemaVersion')
  if (typeof input.name !== 'string' || !NAME.test(input.name)) fail('name')
  const base = input.extends ?? 'docs'
  if (!SITE_THEME_IDS.includes(base as SiteThemeId)) fail('extends')
  if (input.params !== undefined && !isRecord(input.params)) fail('params')
  const tokens = (key: 'tokens' | 'dark'): Record<string, string> => {
    const value = input[key]
    if (value === undefined) return {}
    if (!isRecord(value)) return fail(key)
    for (const [name, token] of Object.entries(value)) {
      if (!tokenNames().all.has(name) || key === 'dark' && !tokenNames().mode.has(name)) fail(`${key}.${name}`)
      if (typeof token !== 'string' || !VALUE.test(token.trim())) fail(`${key}.${name}`)
    }
    return Object.fromEntries(Object.entries(value).map(([name, token]) => [name, (token as string).trim()]))
  }
  const list = (key: 'fonts' | 'styles', valid: (item: string) => boolean): string[] => {
    const value = input[key]
    if (value === undefined) return []
    if (!Array.isArray(value)) return fail(key)
    value.forEach((item, i) => { if (typeof item !== 'string' || !valid(item)) fail(`${key}[${i}]`) })
    return value as string[]
  }
  const manifest: ThemeManifest = {
    name: input.name as string,
    extends: base as SiteThemeId,
    params: isRecord(input.params) ? input.params : {},
    tokens: tokens('tokens'),
    dark: tokens('dark'),
    fonts: list('fonts', item => /^https:\/\/[^\s"'<>]+$/.test(item)),
    styles: list('styles', (item) => {
      const path = resolve(dir, item)
      return item.endsWith('.css') && !isAbsolute(item) && !relative(dir, path).startsWith('..') && existsSync(path)
    }),
  }
  const theme = { dir, file, manifest }
  loaded.set(file, { at, theme })
  return theme
}

/** The directory the site's configuration is written in: a theme's path is relative to it. */
function configDirectory(site: SiteSpec, ctx: RenderContext): string {
  return isSingle(site) ? ctx.deckDir : ctx.workspaceRoot
}

/**
 * The site with its workspace theme resolved: `theme` is the built-in theme it extends, `params` the theme's under the
 * site's own, and `themePackage` names it. Every path that reads the site's shell goes through this first.
 */
export function themedSite(site: SiteSpec, ctx: RenderContext): SiteSpec {
  const ref = site.config.theme
  if (!isThemeReference(ref) || isRecord(site.config.themePackage)) return site
  const { dir, manifest } = loadTheme(ref.trim(), configDirectory(site, ctx), siteLanguage(site))
  const own = site.config.params
  const params = own === undefined ? manifest.params : isRecord(own) ? { ...manifest.params, ...own } : own
  return { ...site, config: { ...site.config, theme: manifest.extends, params, themePackage: { name: manifest.name, dir } } }
}

/** The design tokens of the theme as CSS: the light appearance's colors and shadows, the dark one's, and the rest. */
export function themeTokensCss(manifest: ThemeManifest): string {
  const own = `[data-pm-site-theme-name='${manifest.name}']`
  const rule = (selectors: string[], entries: [string, string][]) => entries.length ? `${selectors.join(',\n')} {\n${entries.map(([name, value]) => `  --pm-${name}: ${value};`).join('\n')}\n}\n` : ''
  const tokens = Object.entries(manifest.tokens)
  return [
    `/* The tokens of site theme ${manifest.name}, generated from its ${THEME_FILE}. */\n`,
    rule([`:root:has(${own})`, own], tokens.filter(([name]) => !tokenNames().mode.has(name))),
    rule([`:root:not(.dark):has(${own})`, `:root:not(.dark) ${own}`], tokens.filter(([name]) => tokenNames().mode.has(name))),
    rule([`:root.dark:has(${own})`, `:root.dark ${own}`], Object.entries(manifest.dark)),
  ].filter(Boolean).join('\n')
}

/** The files of a theme directory with their modification times, to copy it again only when one changed. */
function signature(dir: string): string {
  const files: string[] = []
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const path = join(at, entry.name)
      if (entry.isDirectory()) walk(path)
      else files.push(`${relative(dir, path)}:${statSync(path).mtimeMs}`)
    }
  }
  walk(dir)
  return files.sort().join('\n')
}

const copied = new Map<string, string>()

/** Publishes the theme's files below `outDir/_theme/<name>/` and gives the site the stylesheets its pages link. */
export function publishedTheme(site: SiteSpec, outDir: string, base: string): SiteSpec {
  const own = site.config.themePackage
  if (!isRecord(own) || typeof own.dir !== 'string' || typeof own.name !== 'string') return site
  const { dir, manifest } = loadTheme(own.dir, own.dir, siteLanguage(site))
  const target = join(outDir, THEME_DIR, manifest.name)
  const files = signature(dir) + manifest.name
  if (copied.get(target) !== files || !existsSync(join(target, TOKENS_FILE))) {
    rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    cpSync(dir, target, { recursive: true, filter: source => !source.slice(dir.length).split(sep).some(part => part === 'node_modules' || part.startsWith('.')) })
    writeFileSync(join(target, TOKENS_FILE), themeTokensCss(manifest))
    copied.set(target, files)
  }
  const url = (path: string) => `${base}${THEME_DIR}/${manifest.name}/${relative(dir, resolve(dir, path)).split(sep).join('/')}`
  const stylesheets = [...manifest.fonts, url(TOKENS_FILE), ...manifest.styles.map(url)]
  return { ...site, config: { ...site.config, themePackage: { name: manifest.name, stylesheets } } }
}
