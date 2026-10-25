import { getSharedStateStore, useStore } from '@lincyaw/host'
import { SCREEN_KEY, toggleScreen, toScreenMode } from '../domain/index.ts'
import type { ScreenMode } from '../domain/index.ts'
const state = () => getSharedStateStore<string>(SCREEN_KEY, 'live', { scope: 'remote' })
export function toggleScreenMode(wanted: Exclude<ScreenMode, 'live'>): void { state().set(current => toggleScreen(toScreenMode(current), wanted)) }
export function useScreen(): { mode: ScreenMode, toggle(wanted: Exclude<ScreenMode, 'live'>): void } { return { mode: toScreenMode(useStore(state())), toggle: toggleScreenMode } }
