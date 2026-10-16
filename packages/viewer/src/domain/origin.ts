/**
 * Where a listing comes from (`CodeNode.origin`) and what its output says
 * about the run, as parts both browser forms draw: the web form's viewer and
 * the slides renderer, which writes them into the slides.
 */
import type { CodeNode, ResolutionStatus, RunResult } from '@presmium/kernel'
import type { Locale } from '@presmium/kernel/contracts'

const zh = {
  workingTree: '工作区',
  status: { moved: '已移动', fuzzy: '待确认', lost: '已失效' } as Partial<Record<ResolutionStatus, string>>,
  statusTitle: {
    moved: '引用的代码在文件中移动了位置，显示的是移动后的代码',
    fuzzy: '引用的代码有改动，找到的位置有待确认；运行 presmium check 查看',
    lost: '找不到引用的代码；运行 presmium check 查看',
  } as Partial<Record<ResolutionStatus, string>>,
  drifted: '已漂移',
  driftedTitle: '工作区中的代码已改变，运行 presmium check 查看差异',
  synced: '已锁定',
  syncedTitle: '锁定的代码与工作区一致',
  openFile: (file: string) => `在仓库中打开 ${file}`,
  timedOut: '超时',
  exitCode: (code: number) => `退出码 ${code}`,
  recorded: '预录输出',
}

/** The text of the parts in one UI language. */
export type OriginMessages = typeof zh

const en: OriginMessages = {
  workingTree: 'working tree',
  status: { moved: 'Moved', fuzzy: 'Unconfirmed', lost: 'Lost' },
  statusTitle: {
    moved: 'The referenced code moved in its file; this is the code where it is now',
    fuzzy: 'The referenced code changed and the place found is uncertain; run presmium check to see it',
    lost: 'The referenced code is no longer found; run presmium check to see why',
  },
  drifted: 'Drifted',
  driftedTitle: 'The code changed in the working tree; run presmium check to see the difference',
  synced: 'Pinned',
  syncedTitle: 'The pinned code matches the working tree',
  openFile: file => `Open ${file} in the repository`,
  timedOut: 'Timed out',
  exitCode: code => `Exit code ${code}`,
  recorded: 'Recorded output',
}

export const ORIGIN_MESSAGES: Record<Locale, OriginMessages> = { 'zh-CN': zh, 'en': en }

/** One part of the origin bar, in order: the file and lines, the versions or the commit, a badge. */
export interface OriginPart {
  /** Its class: `pm-code-origin__<kind>`. */
  kind: 'file' | 'variant' | 'commit' | 'badge'
  text: string
  /** A link (to the repository) when set. */
  href?: string
  /** An explanation, e.g. as a tooltip. */
  title?: string
  /** A version: the one on screen. */
  active?: boolean
  /** A badge: the resolution status it shows (`data-status`), or the drift of pinned code (`data-drift`). */
  status?: ResolutionStatus
  drift?: 'synced' | 'drifted'
}

export interface OriginBar {
  /** The anchor of the code reference; absent for a titled listing without one. */
  anchor?: string
  parts: OriginPart[]
}

function lines(start: number, end = start): string {
  return end > start ? `${start}-${end}` : `${start}`
}

/**
 * The origin bar of a listing: the file and lines linked to the repository,
 * the commit of each version (the one on screen marked) or the pinned commit,
 * and a badge when the anchor moved or was lost or pinned code drifted, each
 * badge with its explanation. `shown` is the version on screen; its file
 * link and lines are those of that version. Undefined for a listing with
 * neither origin nor title.
 */
export function originParts(node: CodeNode, shown: number | undefined, locale: Locale): OriginBar | undefined {
  const t = ORIGIN_MESSAGES[locale]
  const { origin } = node
  if (!origin) return node.title ? { parts: [{ kind: 'file', text: node.title }] } : undefined
  const variants = node.variants ?? []
  const version = shown === undefined ? undefined : variants[shown]
  const href = version ? version.permalink : origin.permalink
  const [start, end] = version?.startLine !== undefined ? [version.startLine, version.endLine] : [origin.startLine, origin.endLine]
  const parts: OriginPart[] = [{ kind: 'file', text: `${node.title ?? origin.file}:${lines(start, end)}`, href, title: href ? t.openFile(origin.file) : origin.anchor }]
  if (variants.length) {
    variants.forEach((variant, k) => parts.push({ kind: 'variant', text: variant.label, href: variant.permalink, active: k === shown }))
  } else {
    parts.push({ kind: 'commit', text: origin.pin ? `@ ${origin.pin.slice(0, 7)}` : t.workingTree, title: origin.pin })
  }
  const status = t.status[origin.status]
  if (status) parts.push({ kind: 'badge', text: status, title: t.statusTitle[origin.status], status: origin.status })
  else if (origin.pin && !variants.length && origin.drift) {
    const drifted = origin.drift === 'drifted'
    parts.push({ kind: 'badge', text: drifted ? t.drifted : t.synced, title: drifted ? t.driftedTitle : t.syncedTitle, drift: origin.drift })
  }
  return { anchor: origin.anchor, parts }
}

/** What a run's output says about the run: a timeout, a failing exit code, a recording. */
export function outputNotes(run: RunResult, locale: Locale): string[] {
  const t = ORIGIN_MESSAGES[locale]
  return [
    run.timedOut ? t.timedOut : '',
    run.exitCode !== null && run.exitCode !== 0 ? t.exitCode(run.exitCode) : '',
    run.source === 'recorded' ? t.recorded : '',
  ].filter(Boolean)
}
