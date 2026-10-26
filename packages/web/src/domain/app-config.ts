import type { CrossFormLinks, NavItem, SiteShell } from './config.ts'
import type { Neighbour, WebPage } from './pages.ts'
import type { HomeDocument } from './workspace-home.ts'

/** The element of a page whose JSON tells the viewer app what the page is (`AppConfig`). */
export const APP_CONFIG_ELEMENT = 'presmium-app'

/** A language a document is shown in: its own, or a translation's below `<base><lang>/`. */
export interface SiteLocale {
  lang: string
  label: string
  /** The site path of the document in this language, ending with `/`. */
  base: string
}

/** What a page of the web form has around the document: the site's shell. */
export interface SiteConfig {
  /** The site's title: the document's, or the workspace's on its home page. */
  title: string
  shell: SiteShell
  /** The navigation in this page's language (a translation's own, when the workspace gives one). */
  nav?: NavItem[]
  /** The workspace's list of documents, when the document is one of several. */
  home?: string
  /** The document's languages, its own first; one when it has no translation. */
  locales: SiteLocale[]
  /** The documents before and after this one in the workspace: the pager goes on to them. */
  neighbours?: { prev?: Neighbour, next?: Neighbour }
  links: CrossFormLinks
}

/**
 * What the HTML of a page tells the viewer app (as JSON in `#presmium-app`): the same app shows every page of every
 * document, in a built site, in a dev server and in the workbench, so what a page is comes with the page.
 */
export interface AppConfig {
  /** A page of a document, the workspace's home page (its list of documents), or a page that does not exist. */
  kind: 'document' | 'home' | 'missing'
  /** The document's directory in the workspace (`''` for the document at its root). */
  document: string
  /** One compiled block in a read-only authoring widget; no live or source-edit transport. */
  block?: string
  /** The document's site path, ending with `/`: its pages, its published files and its plugins' run-time files. */
  base: string
  /** The language of the page; a translation's pages are below `<base><lang>/`. */
  lang: string
  /** The form the page shows: the document's pages (`web`, by default), or its slides alone. */
  form?: 'web' | 'slides'
  /** Where the page's IR is: JSON `{ revision, doc }`. */
  ir?: string
  /** The IR's changes as the dev server compiles them (server-sent events). */
  events?: string
  /** The document's own code (`document-bundle.ts`), when it has any. */
  bundle?: string
  /** The search index of the page's language (MiniSearch's JSON). */
  search?: string
  /** The page shown: `index` or a chapter's path (`webPages`). */
  page?: string
  /** A translation's pages, at the paths of the original's (`translationPages`); a document's own are its `webPages`. */
  pages?: WebPage[]
  site: SiteConfig
  /** The workspace's documents, on its home page. */
  documents?: HomeDocument[]
  /** The plugin packages whose browser parts the page runs: the document's (and the operator's, on a site); the home page's are the operator's. */
  plugins?: string[]
  /** Who may embed the page: the workbench's origins. */
  origins: string[]
  /** Where a dev server opens a source line in the author's editor. */
  source?: string
  /** A built site's offline service worker. */
  serviceWorker?: string
  /** Whether the page was rendered on the server: the app then hydrates it. */
  rendered?: boolean
}
