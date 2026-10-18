/**
 * Presmium's brand in DeepSeek Harness's places (docs/design-dsh.md 7.4 and 7.5):
 * the sidebar's brand mark and name, the conversation's opening mark, the
 * first-use notice (the `welcome-notice` step of `settings.onboarding`, below
 * DeepSeek's in priority; the DeepSeek sign-in step is passed over), and the
 * opening's copy through language packs for zh-CN and en-US (a full tag wins
 * over the built-in primary one). The page's title and icon are the host's
 * (src/node/workbench.ts).
 */
import { PmButton, WorkbenchProvider } from '@presmium/workbench'
import type { Workbench } from '@presmium/workbench'
import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { BRAND_LANGUAGES, BRAND_SLOTS, ONBOARDING } from './contract.ts'
import { BRAND_COPY, FRAME_MESSAGES } from './messages.ts'
import type { FrameMessages } from './messages.ts'

/** Presmium's mark: a P of paper on the accent. */
export function Logo({ size = 24, className }: { size?: number, className?: string }) {
  return (
    <svg className={className ? `pmw-logo ${className}` : 'pmw-logo'} width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Presmium">
      <rect width="32" height="32" rx="7" fill="#0F5F5C" />
      <path d="M11 8h7.5a6.5 6.5 0 0 1 0 13H15v4h-4zM15 12v5h3.5a2.5 2.5 0 0 0 0-5z" fill="#F7F5F0" fillRule="evenodd" />
    </svg>
  )
}

/** The frame's text in the workbench's language. */
export function useFrameMessages(workbench: Workbench): FrameMessages {
  const locale = useSyncExternalStore(workbench.subscribe, () => workbench.getState().locale)
  return FRAME_MESSAGES[locale]
}

/** Where this browser remembers the first-use notice was read (a convenience: losing it shows the notice again). */
const WELCOMED = 'presmium.workbench.welcomed'

function welcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED) === '1'
  } catch {
    return false
  }
}

/**
 * Presmium's first-use notice: what the workbench is, and the way to the model's settings. DeepSeek Harness renders
 * the step inside its sidebar, which the root layout may hide, so the notice is drawn over the page.
 */
function Welcome({ workbench, complete, openSection }: { workbench: Workbench, complete?: () => void, openSection?: (id: string) => void }) {
  const t = useFrameMessages(workbench)
  const read = welcomed()
  useEffect(() => {
    if (read) complete?.()
  }, [read, complete])
  if (read) return null
  const done = () => {
    try {
      localStorage.setItem(WELCOMED, '1')
    } catch {
      // Shown again next time.
    }
    complete?.()
  }
  return createPortal(
    <WorkbenchProvider workbench={workbench}>
      <div className="pmw-welcome" role="dialog" aria-modal="true" aria-labelledby="pmw-welcome-title" data-pmw-welcome="">
        <div className="pmw-welcome__card pm-ui">
          <Logo size={40} />
          <h2 id="pmw-welcome-title" className="pmw-welcome__title">{t.welcomeTitle}</h2>
          <p>{t.welcome}</p>
          <div className="pmw-welcome__actions">
            <PmButton
              onClick={() => {
                done()
                openSection?.('models')
              }}
            >
              {t.models}
            </PmButton>
            <PmButton variant="primary" onClick={done}>{t.start}</PmButton>
          </div>
        </div>
      </div>
    </WorkbenchProvider>,
    document.body,
  )
}

/** A first-use step Presmium passes over (DeepSeek's sign-in): it completes at once. */
function PassOver({ complete }: { complete?: () => void }) {
  useEffect(() => {
    complete?.()
  }, [complete])
  return null
}

/** Registers the brand's places; each registration lives as long as the plugin. */
export function brand(ctx: DshClientContext, workbench: Workbench): void {
  const [mark, name, hero] = BRAND_SLOTS
  ctx.effect(() => ctx.slots.inject(mark, () => ctx.slots.register({ name: mark }, ({ size }: { size?: number }) => <Logo size={size ?? 24} />)), 'presmium: sidebar brand mark')
  ctx.effect(() => ctx.slots.inject(name, () => ctx.slots.register({ name }, () => <span className="pmw-brand-name">Presmium</span>)), 'presmium: sidebar brand name')
  ctx.effect(() => ctx.slots.inject(hero, () => ctx.slots.register({ name: hero }, ({ size, className }: { size?: number, className?: string }) => <Logo size={size ?? 34} className={className} />)), 'presmium: conversation brand mark')
  const [welcome, signIn] = ONBOARDING.steps
  ctx.effect(() => ctx.slots.inject(ONBOARDING.slot, () => ctx.slots.register({ name: ONBOARDING.slot, id: welcome, priority: -1, order: -100 }, props => <Welcome workbench={workbench} {...props} />)), 'presmium: first-use notice')
  ctx.effect(() => ctx.slots.inject(ONBOARDING.slot, () => ctx.slots.register({ name: ONBOARDING.slot, id: signIn, priority: -1, order: 0 }, PassOver)), 'presmium: no DeepSeek sign-in step')
  for (const language of BRAND_LANGUAGES) {
    ctx.effect(() => ctx.locale.addLanguage({ id: language.id, label: language.label, fallback: language.fallback }), `presmium: language ${language.id}`)
    for (const [ns, dict] of Object.entries(BRAND_COPY[language.id])) ctx.effect(() => ctx.locale.register(ns, language.id, dict), `presmium: ${ns} copy ${language.id}`)
  }
}
