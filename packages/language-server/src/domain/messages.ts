/** What the language server says in hovers and completions, in the deck's language (N-07). */
import type { Locale } from '@presmium/kernel'

export const LS_MESSAGES = {
  'zh-CN': {
    status: { exact: '已解析', moved: '已移动', fuzzy: '待确认', lost: '已失效' } as Record<string, string>,
    pinnedAt: (commit: string) => `锁定在 ${commit}`,
    drifted: '锁定之后已漂移',
    recordedOutput: '录制的输出',
    timedOut: '超时',
    exitCode: (code: number | null) => `退出码 ${code}`,
    noOutput: '（没有输出）',
    runsLive: '*在浏览器中执行（`:run: live`），没有录制的输出。*',
    notRecorded: '*还没有录制的输出。*',
    moreLines: (count: number) => `…… 另有 ${count} 行`,
    anchorScheme: '锚点类型',
    options: '选项',
    suggest: '提示',
    builtIn: '内置',
  },
  'en': {
    status: { exact: 'exact', moved: 'moved', fuzzy: 'to confirm', lost: 'lost' } as Record<string, string>,
    pinnedAt: (commit: string) => `pinned at ${commit}`,
    drifted: 'drifted since the pin',
    recordedOutput: 'Recorded output',
    timedOut: 'timed out',
    exitCode: (code: number | null) => `exit code ${code}`,
    noOutput: '(no output)',
    runsLive: '*Runs in the browser (`:run: live`); no recorded output.*',
    notRecorded: '*No recorded output yet.*',
    moreLines: (count: number) => `… ${count} more lines`,
    anchorScheme: 'anchor scheme',
    options: 'Options',
    suggest: 'Suggest',
    builtIn: 'built-in',
  },
} satisfies Record<Locale, unknown>

export type LsMessages = (typeof LS_MESSAGES)[Locale]
