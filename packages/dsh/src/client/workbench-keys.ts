import type { Workbench } from '@lincyaw/workbench'
import { CLIENT_MESSAGES } from './messages.ts'
import type { ClientMessages } from './messages.ts'

const apple = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
const mod = apple ? '⌘' : 'Ctrl', shift = apple ? '⇧' : 'Shift'
const key = (code: string, ...modifiers: string[]) => ({ code, modifiers })

// The reference lists an extension's rows in the order of their ids, so the ids carry the order.
const ROWS: { id: string, label: keyof ClientMessages['keys'], keys: string[], bindings: [DshShortcutBinding, ...DshShortcutBinding[]] }[] = [
  { id: 'presmium.keys-1-save', label: 'save', keys: [mod, 'S'], bindings: [key('KeyS', 'primary')] },
  { id: 'presmium.keys-2-undo', label: 'undo', keys: [mod, 'Z'], bindings: [key('KeyZ', 'primary')] },
  { id: 'presmium.keys-3-redo', label: 'redo', keys: apple ? [mod, shift, 'Z'] : [mod, 'Y'], bindings: apple ? [key('KeyZ', 'primary', 'shift')] : [key('KeyY', 'primary'), key('KeyZ', 'primary', 'shift')] },
  { id: 'presmium.keys-4-play', label: 'play', keys: ['Space'], bindings: [key('Space')] },
  { id: 'presmium.keys-5-step', label: 'step', keys: ['←', '→'], bindings: [key('ArrowLeft'), key('ArrowRight')] },
  { id: 'presmium.keys-6-overview', label: 'overview', keys: ['O'], bindings: [key('KeyO')] },
  { id: 'presmium.keys-7-fullscreen', label: 'fullscreen', keys: [shift, 'F'], bindings: [key('KeyF', 'shift')] },
]

/**
 * Lists the workbench's own keys in Harness's shortcut reference (Settings → General → Edit Shortcuts, or Mod+/). They are
 * fixed rows: the workbench and its preview handle the keys themselves, and the rows keep them from editable commands.
 */
export function registerWorkbenchKeys(ctx: DshClientContext, workbench: Workbench): void {
  ctx.effect(() => {
    const disposers = ROWS.flatMap(({ label, ...row }) => {
      try {
        return [ctx.shortcuts.registerFixed({ ...row, label: () => CLIENT_MESSAGES[workbench.state.locale].keys[label], group: 'application' })]
      } catch (error) {
        console.warn(`[presmium] the shortcut reference did not take ${row.id}`, error)
        return []
      }
    })
    return () => { for (const dispose of disposers) dispose() }
  }, 'presmium: the workbench keys in the shortcut reference')
}
