import type { RunResult } from '@lincyaw/kernel'
import type { Locale } from '@lincyaw/kernel/contracts'

const zh = {
  timedOut: '超时',
  exitCode: (code: number) => `退出码 ${code}`,
  recorded: '预录输出',
}

export type OutputMessages = typeof zh

const en: OutputMessages = {
  timedOut: 'Timed out',
  exitCode: code => `Exit code ${code}`,
  recorded: 'Recorded output',
}

export const OUTPUT_MESSAGES: Record<Locale, OutputMessages> = { 'zh-CN': zh, 'en': en }

export function outputNotes(run: RunResult, locale: Locale): string[] {
  const t = OUTPUT_MESSAGES[locale]
  return [
    run.timedOut ? t.timedOut : '',
    run.exitCode !== null && run.exitCode !== 0 ? t.exitCode(run.exitCode) : '',
    run.source === 'recorded' ? t.recorded : '',
  ].filter(Boolean)
}
