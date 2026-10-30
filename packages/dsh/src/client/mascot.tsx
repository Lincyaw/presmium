import { PmMascot, PmSegmented, setMascotEnabled, useAssistantMascot, useMascotEnabled, WorkbenchProvider } from '@lincyaw/workbench'
import type { Workbench } from '@lincyaw/workbench'
import { MASCOT_SETTING, MASCOT_SLOT } from './contract.ts'
import { useClientMessages } from './messages.ts'

/** The session header's standard prop: a selector over the bound session's snapshot. */
type UseSession = <T>(select: (snapshot: { running?: boolean }) => T) => T

function Kitten({ running }: { running: boolean }) {
  return <span className="pmw-conversation-mascot"><PmMascot size="small" action={useAssistantMascot(running)} /></span>
}

function MascotSetting({ workbench }: { workbench: Workbench }) {
  const t = useClientMessages(workbench)
  const on = useMascotEnabled()
  return (
    <div className="pmw-mascot-setting pm-ui" data-pmw-setting="mascot">
      <div className="pmw-mascot-setting__copy">
        <p className="pmw-mascot-setting__title">{t.mascot}</p>
        <p className="pmw-mascot-setting__hint">{t.mascotHint}</p>
      </div>
      <PmSegmented label={t.mascot} value={on ? 'show' : 'hide'} options={[{ value: 'show', label: t.mascotShow }, { value: 'hide', label: t.mascotHide }]} onChange={value => setMascotEnabled(value === 'show')} />
    </div>
  )
}

/** Puts the kitten in the conversation's header, where it acts out what the assistant is doing, and its switch in
 * Settings → General. */
export function registerMascot(ctx: DshClientContext, workbench: Workbench): void {
  ctx.effect(() => ctx.slots.inject(MASCOT_SLOT.name, () => ctx.slots.register({ name: MASCOT_SLOT.name, id: MASCOT_SLOT.id, order: -100 }, ({ useSession }: { useSession: UseSession }) => {
    const running = useSession(snapshot => Boolean(snapshot.running))
    return <WorkbenchProvider workbench={workbench}><Kitten running={running} /></WorkbenchProvider>
  })), 'presmium: the kitten beside the conversation')
  ctx.effect(() => ctx.slots.inject(MASCOT_SETTING.name, () => ctx.slots.register({ name: MASCOT_SETTING.name, id: MASCOT_SETTING.id, order: 1000 }, () => (
    <WorkbenchProvider workbench={workbench}><MascotSetting workbench={workbench} /></WorkbenchProvider>
  ))), 'presmium: the kitten\'s switch in Settings')
}
