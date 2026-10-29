import type { Locale } from '../contracts/locale.ts'

/** The language of command-line output: the system's (`LC_ALL`, `LC_MESSAGES`, `LANG`, else `Intl`'s); `zh*` is zh-CN. */
export function systemLocale(env: NodeJS.ProcessEnv = process.env): Locale {
  const tag = env.LC_ALL || env.LC_MESSAGES || env.LANG || Intl.DateTimeFormat().resolvedOptions().locale
  return /^zh/i.test(tag) ? 'zh-CN' : 'en'
}
