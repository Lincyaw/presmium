/**
 * Texts of the deltabox plugin in zh-CN and en (N-07), in the deck's `lang`:
 * the build report's note on code that runs without the process sandbox, the
 * startup log's reasons for leaving a service out, and the review's errors.
 */
import { deckLocale } from '@presmium/kernel'
import type { Unqualified } from './protocol.ts'

const zhCN = {
  unqualified: ({ reason, detail }: Unqualified): string => ({
    platform: `deltabox 只支持 Linux（x64、arm64），本机是 ${detail}`,
    macos: 'macOS 上的 deltabox 还没有先行验证，验证通过之前不启用',
    glibc: `deltabox 需要 glibc 2.39 以上，本机是 ${detail}`,
    binding: `无法加载 deltabox 的 Node 绑定：${detail}`,
    start: `无法以 cbcow-through 启动 deltabox 会话（需要 FUSE 与 Landlock）：${detail}`,
    degraded: `Landlock 不能提供全部保护（${detail}）`,
    helper: `deltabox 辅助进程失败：${detail}`,
  })[reason],
  stateInside: (dir: string) => `settings.presmium.deltabox.stateDir（${dir}）位于工作区之内，它必须在工作区之外`,
  sandboxOff: '运营者设置 settings.presmium.deltabox.sandbox 为 false',
  reviewOff: '运营者设置 settings.presmium.deltabox.review 为 false',
  noSandbox: (reason: string) => `不登记进程沙箱（presmium.processSandbox）：${reason}`,
  noReview: (reason: string) => `不登记修改审阅（presmium.changeReview）：${reason}`,
  recovered: (dirs: string[]) => `已清理崩溃的进程留下的 deltabox 会话：${dirs.join('、')}`,
  notIsolated: (reason: string) => `编译时执行的代码不经进程沙箱运行：${reason}`,
  enable: '主机满足条件（Linux、glibc 2.39 以上、FUSE 与 Landlock）时 deltabox 默认启用；见 settings.presmium.deltabox',
  busy: (dir: string) => `文档目录 ${dir} 已有进行中的修改审阅`,
  ended: '这次修改审阅已经结束',
}

type Messages = typeof zhCN

const en: Messages = {
  unqualified: ({ reason, detail }: Unqualified): string => ({
    platform: `deltabox supports Linux (x64, arm64) only; this machine is ${detail}`,
    macos: 'deltabox is not verified on macOS yet and stays off until it is',
    glibc: `deltabox needs glibc 2.39 or later; this machine has ${detail}`,
    binding: `cannot load deltabox's Node binding: ${detail}`,
    start: `cannot start a cbcow-through deltabox session (it needs FUSE and Landlock): ${detail}`,
    degraded: `Landlock cannot give every protection (${detail})`,
    helper: `the deltabox helper failed: ${detail}`,
  })[reason],
  stateInside: (dir: string) => `settings.presmium.deltabox.stateDir (${dir}) lies inside the workspace; it must be outside it`,
  sandboxOff: 'the operator set settings.presmium.deltabox.sandbox to false',
  reviewOff: 'the operator set settings.presmium.deltabox.review to false',
  noSandbox: (reason: string) => `no process sandbox (presmium.processSandbox): ${reason}`,
  noReview: (reason: string) => `no change review (presmium.changeReview): ${reason}`,
  recovered: (dirs: string[]) => `cleaned up the deltabox sessions a crashed process left: ${dirs.join(', ')}`,
  notIsolated: (reason: string) => `compile-time code runs without the process sandbox: ${reason}`,
  enable: 'deltabox is on by default where the host qualifies (Linux, glibc 2.39 or later, FUSE and Landlock); see settings.presmium.deltabox',
  busy: (dir: string) => `a change review of the document directory ${dir} is under way`,
  ended: 'this change review has ended',
}

export function messages(lang?: string): Messages {
  return deckLocale(lang) === 'zh-CN' ? zhCN : en
}
