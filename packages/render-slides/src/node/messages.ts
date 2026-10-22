import type { Locale } from '@lincyaw/kernel'

export const SLIDES_MESSAGES = {
  'zh-CN': {
    webOnly: (name: string) => `组件 ${name} 只能在网页中查看。`,
  },
  'en': {
    webOnly: (name: string) => `The component ${name} can only be viewed on the web.`,
  },
} satisfies Record<Locale, unknown>

export type SlidesMessages = (typeof SLIDES_MESSAGES)[Locale]
