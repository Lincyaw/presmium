import { deckLocale } from '@lincyaw/kernel'

const TERMINAL = {
  'zh-CN': (name: string) => `环境 ${name} 的终端：请在网页或幻灯片中打开。`,
  'en': (name: string) => `Terminal of environment ${name}: open it on the web page or in the slides.`,
}

export function terminalFallback(name: string, lang: string | undefined): string {
  return TERMINAL[deckLocale(lang)](name)
}
