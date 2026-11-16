import { useStartupReady } from './startup.ts'
import { useLayoutEffect } from 'react'
import { PmIconButton } from '@lincyaw/workbench'
import type { Workbench } from '@lincyaw/workbench'
import { CLIENT_MESSAGES } from './messages.ts'

let current: (() => void) | undefined
/** Public settings.launcher contract; no hidden sidebar DOM or dependency internals. */
export function openAppSettings(): void { current?.() }
export function registerSettingsLauncher(ctx: DshClientContext, workbench: Workbench): void {
  ctx.effect(() => ctx.slots.inject('settings.launcher', () => ctx.slots.register({ name: 'settings.launcher' }, function SettingsLauncher({ openSettings }: { openSettings(): void }) {
    useStartupReady(workbench)
    useLayoutEffect(() => {
      current = openSettings
      return () => { if (current === openSettings) current = undefined }
    }, [openSettings])
    return <PmIconButton icon="sliders" label={CLIENT_MESSAGES[workbench.state.locale].settings} onClick={openSettings} />
  })), 'presmium: settings launcher')
}
