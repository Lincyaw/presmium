import { deckLocale } from '@presmium/kernel'

export function terminalFallback(name: string, lang: string | undefined): string {
  return deckLocale(lang) === 'en'
    ? `Terminal of the environment ${name}: open it in the web page or the slides.`
    : `环境 ${name} 的终端：在网页或幻灯片中打开。`
}
