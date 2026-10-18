declare module '@deepseek-ai/dsh-client-store' {
  export interface StoreInstance<S, A> {
    actions: A
    getSnapshot(): S
    subscribe(listener: () => void): () => void
  }
  export interface StoreHandle<S, A> {
    create(): StoreInstance<S, A>
  }
  type Bound<A> = { [K in keyof A]: A[K] extends (draft: any, ...args: infer P) => void ? (...args: P) => void : never }
  export function defineStore<S, A extends Record<string, (draft: S, ...args: any[]) => void>>(spec: { init: () => S, actions: A }): StoreHandle<S, Bound<A>>
}

interface DshObservable<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

type DshSelectorHook<T> = <U>(select: (value: T) => U) => U

interface DshSlotOptions {
  name: string
  key?: string
  id?: string
  priority?: number
  order?: number
  locale?: string
  label?: string | (() => string)
  children?: Record<string, { kind: 'single' | 'keyed' | 'list', scope: 'root' }>
  store?: unknown
  inject?: unknown
}

interface DshSlotEntry {
  options: { key?: string, id?: string }
}

interface DshSlots {
  register(options: DshSlotOptions, component: (props: any) => unknown): () => void
  inject(name: string, effect: () => unknown): void
  entries(name: string): DshSlotEntry[]
  subscribe(name: string, listener: () => void): () => void
  provideRoot(options: { hooks: Record<string, DshObservable<unknown>> }): () => void
}

interface DshThemeSnapshot {
  preference: string
  fontSizes: { text: number, code: number, terminal: number }
  fontFamilies: { text: string, code: string, terminal: string }
  active: { id: string, colorScheme: 'light' | 'dark', tokens: Record<string, string> }
}

interface DshTheme {
  getTheme(): DshThemeSnapshot
  overrideTokens(source: string, tokens: Record<string, { light: string, dark: string }>): () => void
}

interface DshLocale {
  getLocale(): { active: string, locales: readonly { id: string }[] }
  subscribe(listener: () => void): () => void
  addLanguage(language: { id: string, label: string, fallback?: string }): () => void
  register(ns: string, locale: string | Record<string, Record<string, string>>, dict?: Record<string, string>): () => void
  bind(ns: string): (key: string, values?: Record<string, string>) => string
}

interface DshShortcuts {
  register(command: {
    id: string
    label: () => string
    aliases?: string[]
    defaults: Record<string, { code: string, modifiers: string[] }>
    regions?: string[]
    modals?: string[]
    resolve: () => { status: 'handled', run: () => void }
  }): () => void
}

interface DshSidebarRightTabs {
  register(definition: {
    id: string
    kind: string
    priority?: 'extension' | 'builtin' | 'fallback'
    keepMounted?: boolean
    title: (address?: string) => string
    guide?: { id: string, order?: number, title: () => string, description?: () => string }[]
  }): () => void
}

interface DshClientContext {
  effect(effect: () => unknown, label?: string): void
  on(event: string, listener: (...args: any[]) => void): () => void
  inject(names: string[], apply: (ctx: DshClientContext) => void): void
  reflect: { provide(name: string, value: unknown): () => void }
  slots: DshSlots
  theme: DshTheme
  locale: DshLocale
  shortcuts: DshShortcuts
  sidebarRightTabs: DshSidebarRightTabs
  layout: { selectPanel(id: string | null): void }
}

interface Window {
  __DSH_BOOT__?: { entries: { id: string }[], release?: { version: string, commit?: string } }
}
