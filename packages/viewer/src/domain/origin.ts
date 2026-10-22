import type { CodeNode, ResolutionStatus } from '@lincyaw/kernel'
import type { Locale } from '@lincyaw/kernel/contracts'

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
}

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
}

export const ORIGIN_MESSAGES: Record<Locale, OriginMessages> = { 'zh-CN': zh, 'en': en }

export interface OriginPart {
  kind: 'file' | 'variant' | 'commit' | 'badge'
  text: string
  href?: string
  title?: string
  active?: boolean
  status?: ResolutionStatus
  drift?: 'synced' | 'drifted'
}

export interface OriginBar {
  anchor?: string
  parts: OriginPart[]
}

function lines(start: number, end = start): string {
  return end > start ? `${start}-${end}` : `${start}`
}

export function originBar(node: CodeNode, shown: number | undefined, locale: Locale): OriginBar | undefined {
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
