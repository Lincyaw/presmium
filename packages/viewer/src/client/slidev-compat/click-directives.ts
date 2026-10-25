import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useStep } from '@lincyaw/host'
import { clickVisible, resolveClicks } from '../../domain/index.ts'
import type { ClickSpec } from '../../domain/index.ts'
import { h } from '../element.ts'
export const BLOCK_CLASS = 'pm-block'
export function trackClicks(block: HTMLElement, step: number): () => void {
  const items = [...block.querySelectorAll<HTMLElement>('[data-click-at]')]
  const ranges = resolveClicks(items.map(el => ({ kind: el.dataset.clickKind === 'after' ? 'after' : 'click', at: Number(el.dataset.clickAt), hide: el.dataset.clickHide === 'true' })))
  items.forEach((el, i) => el.dataset.pmClick = clickVisible(ranges[i]!, step) ? 'shown' : 'hidden')
  return () => {}
}
export function VClick({ at = 1, hide = false, children }: { at?: unknown, hide?: boolean, children?: ReactNode }) { const step = useStep(); const range = resolveClicks([{ kind: 'click', at, hide }])[0]!; return h('span', { className: 'pm-v-click', 'data-pm-click': clickVisible(range, step) ? 'shown' : 'hidden' }, children) }
export const VAfter = VClick
export function VClicks({ every = 1, hide, children }: { every?: number, hide?: boolean, children?: ReactNode }) { const root = useRef<HTMLDivElement>(null); const step = useStep(); useEffect(() => { const items = [...root.current?.children ?? []] as HTMLElement[]; const ranges = resolveClicks(items.map((_, k): ClickSpec => ({ kind: k % every ? 'after' : 'click', hide }))); items.forEach((item, k) => item.dataset.pmClick = clickVisible(ranges[k]!, step) ? 'shown' : 'hidden') }, [step, every, hide]); return h('div', { ref: root, className: 'pm-v-clicks' }, children) }
