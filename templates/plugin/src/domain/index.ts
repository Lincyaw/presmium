/**
 * The plugin's domain: pure TypeScript, which the Node side, the component and the tests share.
 * It imports nothing of Vue, Node, @lincyaw/host or the frameworks (AGENTS.md, layering).
 */
import type { Locale } from '@lincyaw/kernel/contracts'

/** The plugin's id: its routes are under `/__presmium/<id>/`, its configuration is `presmium.<id>`. */
export const PLUGIN_ID = '{{id}}'

/** The component the directive becomes: `components/GreetingCard.vue`, by its file name. */
export const COMPONENT = 'GreetingCard'

/** What the route `waves` answers: how often the document was waved at, since the server started. */
export interface Waves {
  waves: number
}

export interface GreetingMessages {
  greeting(name: string): string
  /** Whom a `{greeting}` without an argument greets. */
  everyone: string
  wave: string
  waves(count: number): string
}

/**
 * The plugin's text in Chinese and English: the component picks by the page's language
 * (`useMessages`), the directive by the document's (`deckLocale(ctx.lang)`) for the text it
 * writes into the output.
 */
export const GREETING_MESSAGES: Record<Locale, GreetingMessages> = {
  'zh-CN': {
    greeting: name => `你好，${name}！`,
    everyone: '大家',
    wave: '挥手',
    waves: count => `已挥手 ${count} 次`,
  },
  'en': {
    greeting: name => `Hello, ${name}!`,
    everyone: 'everyone',
    wave: 'Wave',
    waves: count => (count === 1 ? 'Waved once' : `Waved ${count} times`),
  },
}
