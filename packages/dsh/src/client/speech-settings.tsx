import { SpeechSettingsPanel, SPEECH_SETTINGS_MESSAGES, WorkbenchProvider } from '@lincyaw/workbench'
import type { Workbench } from '@lincyaw/workbench'

/** The framework owns Settings navigation; Presmium owns its operator service page. */
export function registerSpeechSettings(ctx: DshClientContext, workbench: Workbench): void {
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'presmium-speech', order: 30, label: () => SPEECH_SETTINGS_MESSAGES[workbench.state.locale].title }, () => <WorkbenchProvider workbench={workbench}><SpeechSettingsPanel /></WorkbenchProvider>)), 'presmium: voice service settings')
}
