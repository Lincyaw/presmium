import { PmButton, WorkbenchProvider } from '@lincyaw/workbench'
import type { Workbench } from '@lincyaw/workbench'
import { useEffect } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { BRAND_SLOTS, ONBOARDING } from './contract.ts'
import { BRAND_COPY, BRAND_LANGUAGES, useClientMessages } from './messages.ts'
import { rememberOpenSection } from './settings-opener.ts'

export function Logo({ size = 24, className }: { size?: number, className?: string }) {
  return (
    <svg className={className ? `pmw-logo ${className}` : 'pmw-logo'} width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Presmium">
      <rect width="32" height="32" rx="7" fill="#0F5F5C" />
      <path d="M11 8h7.5a6.5 6.5 0 0 1 0 13H15v4h-4zM15 12v5h3.5a2.5 2.5 0 0 0 0-5z" fill="#F7F5F0" fillRule="evenodd" />
    </svg>
  )
}

const WELCOMED = 'presmium.workbench.welcomed'

function welcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED) === '1'
  } catch {
    return false
  }
}

function Welcome({ workbench, complete, openSection }: { workbench: Workbench, complete?: () => void, openSection?: (id: string) => void }) {
  const t = useClientMessages(workbench)
  const read = welcomed()
  useEffect(() => rememberOpenSection(openSection), [openSection])
  useEffect(() => {
    if (read) complete?.()
  }, [read, complete])
  if (read) return null
  const done = () => {
    try {
      localStorage.setItem(WELCOMED, '1')
    } catch {
    }
    complete?.()
  }
  return (
    <WorkbenchProvider workbench={workbench}>
      <Modal open title={t.welcomeTitle} onClose={done} headless>
        <div className="pmw-welcome__card pm-ui" data-pmw-welcome="">
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
      </Modal>
    </WorkbenchProvider>
  )
}

function PassOver({ complete, openSection }: { complete?: () => void, openSection?: (id: string) => void }) {
  useEffect(() => {
    rememberOpenSection(openSection)
    complete?.()
  }, [complete, openSection])
  return null
}

/** Puts Presmium's mark, name, first-use notice and languages in DeepSeek Harness's slots, in every layout. */
export function registerBrand(ctx: DshClientContext, workbench: Workbench): void {
  const [mark, name, hero] = BRAND_SLOTS
  ctx.effect(() => ctx.slots.inject(mark, () => ctx.slots.register({ name: mark }, ({ size }: { size?: number }) => <Logo size={size ?? 24} />)), 'presmium: sidebar brand mark')
  ctx.effect(() => ctx.slots.inject(name, () => ctx.slots.register({ name }, () => <span className="pmw-brand-name">Presmium</span>)), 'presmium: sidebar brand name')
  ctx.effect(() => ctx.slots.inject(hero, () => ctx.slots.register({ name: hero }, ({ size, className }: { size?: number, className?: string }) => <Logo size={size ?? 34} className={className} />)), 'presmium: conversation brand mark')
  const [welcome, signIn] = ONBOARDING.steps
  ctx.effect(() => ctx.slots.inject(ONBOARDING.slot, () => ctx.slots.register({ name: ONBOARDING.slot, id: welcome, priority: -1, order: -100 }, props => <Welcome workbench={workbench} {...props} />)), 'presmium: first-use notice')
  ctx.effect(() => ctx.slots.inject(ONBOARDING.slot, () => ctx.slots.register({ name: ONBOARDING.slot, id: signIn, priority: -1, order: 0 }, PassOver)), 'presmium: no DeepSeek sign-in step')
  // Harness's own `English` and `中文` carry its developer copy in the AI panel ("Describe what you want to build…"),
  // and a language's dictionary cannot be registered twice; a choice of either becomes the same language with Presmium's
  // copy. Only changes are followed: the page's first, provisional language may still give way to the stored one.
  for (const language of BRAND_LANGUAGES) {
    ctx.effect(() => ctx.locale.addLanguage({ id: language.id, label: language.label, fallback: language.fallback }), `presmium: language ${language.id}`)
    for (const [ns, dict] of Object.entries(BRAND_COPY[language.id])) ctx.effect(() => ctx.locale.register(ns, language.id, dict), `presmium: ${ns} copy ${language.id}`)
  }
  ctx.effect(() => ctx.locale.subscribe(() => {
    const active = ctx.locale.getLocale().active
    const language = BRAND_LANGUAGES.find(candidate => candidate.fallback === active)
    // The language may still be unregistered while its definition loads or after it is unloaded.
    if (language && ctx.locale.getLocale().locales.some(locale => locale.id === language.id)) void ctx.locale.setLocale(language.id)
  }), 'presmium: Harness\'s languages with Presmium\'s copy')
}
