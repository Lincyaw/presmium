import { useEffect } from 'react'
import type { RefObject } from 'react'
import { PmIconButton, useStore } from '@lincyaw/host'
import type { IconName } from '@lincyaw/host'
import type { IRSection } from '@lincyaw/kernel'
import { BlockView } from '../block.ts'
import { listLayers } from '../registry.ts'
import type { ViewerLayer } from '../registry.ts'
import type { Viewer } from '../viewer-state.ts'
import { h } from '../element.ts'
export function useModal(root: RefObject<HTMLElement | null>, embedded = false) { useEffect(() => { if (!embedded || document.hasFocus()) root.current?.focus({ preventScroll: true }) }, [root, embedded]) }
export function useOverlayBar(bar: RefObject<HTMLElement | null>) { useEffect(() => { const element = bar.current; if (!element) return; const update = () => document.documentElement.style.setProperty('--pm-overlay-bar', `${element.offsetHeight}px`); const observer = new ResizeObserver(update); observer.observe(element); update(); return () => { observer.disconnect(); document.documentElement.style.removeProperty('--pm-overlay-bar') } }, [bar]) }
export function useCurrentSection(viewer: Viewer, _view: string) { const position = useStore(viewer.position); useStore(viewer.doc); return { section: viewer.section(position.section), step: position.step } }
export function visuals(section: IRSection, step: number) { return section.blocks.filter(block => block.role === 'visual').map(block => h(BlockView, { key: `${section.id}/${block.id}`, block, section, step })) }
export function button(label: string, onClick: () => void, icon: IconName, shortcut?: string, attrs: Record<string, unknown> = {}) { const keys: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', 'Shift+F': '⇧ F' }; return h(PmIconButton, { ...attrs, icon, label, small: true, hint: shortcut ? `${label} · ${keys[shortcut] ?? shortcut.toUpperCase()}` : label, 'aria-keyshortcuts': shortcut, onClick }) }
export function layers(view: string, scope: NonNullable<ViewerLayer['scope']>, props: Record<string, unknown> = {}) { return listLayers(view).filter(layer => (layer.scope ?? 'viewport') === scope).map(layer => h(layer.component, { key: layer.id, view, ...props })) }
