import type { Locale } from '@lincyaw/kernel'

export const LS_MESSAGES = {
  'zh-CN': {
    status: { exact: '已解析', moved: '已移动', fuzzy: '待确认', lost: '已失效' } as Record<string, string>,
    pinnedAt: (commit: string) => `锁定在 ${commit}`,
    drifted: '锁定之后已漂移',
    recordedOutput: '录制的输出',
    timedOut: '超时',
    exitCode: (code: number | null) => `退出码 ${code}`,
    noOutput: '（没有输出）',
    runsLive: '*配置为在浏览器中执行，尚无录制输出。*',
    notRecorded: '*还没有录制的输出。*',
    moreLines: (count: number) => `…… 另有 ${count} 行`,
  },
  'en': {
    status: { exact: 'exact', moved: 'moved', fuzzy: 'to confirm', lost: 'lost' } as Record<string, string>,
    pinnedAt: (commit: string) => `pinned at ${commit}`,
    drifted: 'drifted since the pin',
    recordedOutput: 'Recorded output',
    timedOut: 'timed out',
    exitCode: (code: number | null) => `exit code ${code}`,
    noOutput: '(no output)',
    runsLive: '*Configured to run in the browser; no recorded output.*',
    notRecorded: '*No recorded output yet.*',
    moreLines: (count: number) => `… ${count} more lines`,
  },
} satisfies Record<Locale, unknown>

export type LsMessages = (typeof LS_MESSAGES)[Locale]
