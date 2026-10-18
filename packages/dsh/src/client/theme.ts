import { color } from '@presmium/design'
import type { ColorName } from '@presmium/design'

type Pair = { light: string, dark: string }
const same = (value: string): Pair => ({ light: value, dark: value })
const pm = (name: ColorName): Pair => same(color(name))
const mix = (name: ColorName, percent: number, other = 'transparent'): Pair => same(`color-mix(in srgb, ${color(name)} ${percent}%, ${other})`)

export const TOKENS: Record<string, Pair> = {
  '--dsw-alias-bg-base': pm('bg'),
  '--dsw-alias-bg-document-preview': pm('surface'),
  '--dsw-alias-bg-layer-1': pm('surface'),
  '--dsw-alias-bg-layer-2': pm('surface'),
  '--dsw-alias-bg-layer-3': pm('sunk'),
  '--dsw-alias-bg-mask-1': { light: 'rgba(28, 27, 25, 0.32)', dark: 'rgba(0, 0, 0, 0.55)' },
  '--dsw-alias-bg-mask-drop': { light: 'rgba(247, 245, 240, 0.7)', dark: 'rgba(22, 22, 20, 0.7)' },
  '--dsw-alias-bg-module-platform': pm('sunk'),
  '--dsw-alias-bg-overlay': pm('surface'),
  '--dsw-alias-bg-skeleton': mix('ink', 6),
  '--dsw-alias-border-inverted': same('transparent'),
  '--dsw-alias-border-l1': pm('line'),
  '--dsw-alias-border-l2': pm('line'),
  '--dsw-alias-border-l2-darkmode-thin': pm('line'),
  '--dsw-alias-border-l3': pm('line'),
  '--dsw-alias-border-l4': pm('line-strong'),
  '--dsw-alias-brand-primary': pm('ink'),
  '--dsw-alias-brand-primary-new-colorprimary-new-color': pm('accent'),
  '--dsw-alias-button-contrast-fill': pm('ink'),
  '--dsw-alias-button-elevated-fill': pm('surface'),
  '--dsw-alias-button-floating-fill': pm('surface'),
  '--dsw-alias-button-floating-hover': pm('sunk'),
  '--dsw-alias-button-ghost-active-border': pm('line-strong'),
  '--dsw-alias-button-ghost-active-fill': pm('selected'),
  '--dsw-alias-button-info-fill': { light: '#0f5f5c', dark: '#2c7a74' },
  '--dsw-alias-button-info-hover': { light: '#0b4a47', dark: '#256963' },
  '--dsw-alias-button-primary-fill': pm('ink'),
  '--dsw-alias-button-primary-hover': mix('ink', 85, color('bg')),
  '--dsw-alias-file-diff-added-bg': pm('ok-soft'),
  '--dsw-alias-file-diff-added-gutter': pm('ok-soft'),
  '--dsw-alias-file-diff-added-marker': pm('add'),
  '--dsw-alias-file-diff-deleted-bg': pm('danger-soft'),
  '--dsw-alias-file-diff-deleted-gutter': pm('danger-soft'),
  '--dsw-alias-file-diff-deleted-marker': pm('del'),
  '--dsw-alias-interactive-bg-active': pm('selected'),
  '--dsw-alias-interactive-bg-hover': mix('ink', 6),
  '--dsw-alias-interactive-bg-hover-danger': pm('danger-soft'),
  '--dsw-alias-interactive-bg-hover-solid': pm('sunk'),
  '--dsw-alias-label-caption': pm('muted'),
  '--dsw-alias-label-deep-diving': pm('accent'),
  '--dsw-alias-label-deep-diving-shimmer': pm('muted'),
  '--dsw-alias-label-dimmed': pm('line-strong'),
  '--dsw-alias-label-primary': pm('ink'),
  '--dsw-alias-label-primary-bluish': pm('ink'),
  '--dsw-alias-label-primary-dimmed': pm('ink'),
  '--dsw-alias-label-primary-foreground': pm('bg'),
  '--dsw-alias-label-primary-inverted': pm('bg'),
  '--dsw-alias-label-secondary': pm('muted'),
  '--dsw-alias-label-tertiary': pm('muted'),
  '--dsw-alias-link': pm('accent'),
  '--dsw-alias-markdown-citation': pm('sunk'),
  '--dsw-alias-markdown-code-block': pm('code'),
  '--dsw-alias-markdown-code-block-banner': pm('sunk'),
  '--dsw-alias-menu-icon': pm('ink'),
  '--dsw-alias-onboarding-accent': pm('accent'),
  '--dsw-alias-onboarding-card-fill': pm('surface'),
  '--dsw-alias-onboarding-checkbox-border': pm('line-strong'),
  '--dsw-alias-onboarding-secondary-fill': pm('surface'),
  '--dsw-alias-scrollbar-bg-l1': pm('line'),
  '--dsw-alias-scrollbar-bg-l2': pm('line'),
  '--dsw-alias-scrollbar-hover-l1': pm('line-strong'),
  '--dsw-alias-scrollbar-hover-l2': pm('line-strong'),
  '--dsw-alias-settings-card-fill': pm('surface'),
  '--dsw-alias-settings-card-stroke': pm('line'),
  '--dsw-alias-state-business-primary': pm('accent'),
  '--dsw-alias-state-business-tertiary': pm('accent-soft'),
  '--dsw-alias-state-error-primary': pm('danger'),
  '--dsw-alias-state-error-secondary': pm('danger'),
  '--dsw-alias-state-success-primary': pm('ok'),
  '--dsw-alias-state-success-secondary': pm('ok'),
  '--dsw-alias-state-success-tertiary': pm('ok-soft'),
  '--dsw-alias-state-warn-label': pm('warn'),
  '--dsw-alias-state-warn-primary': pm('warn'),
  '--dsw-alias-state-warn-secondary': pm('warn'),
  '--dsw-alias-state-warn-tertiary': pm('warn-soft'),
  '--dsw-alias-tooltip-bg': { light: '#1c1b19', dark: '#3a3833' },
  '--dsw-alias-turn-trigger-bg': pm('code'),
  '--dsw-alias-turn-trigger-bg-hover': mix('ink', 6),
  '--dsw-specific-sidebar-fill': pm('sunk'),
  '--dsw-specific-sidebar-nav-item-active': pm('selected'),
  '--dsw-specific-sidebar-nav-item-active-accent': pm('accent'),
  '--dsw-specific-sidebar-nav-item-hover': mix('ink', 6),
  '--dsw-specific-bubble': pm('accent-soft'),
  '--dsw-specific-bubble-highlight': pm('selected'),
  '--dsw-specific-input-major': pm('surface'),
  '--dsw-specific-menu': pm('surface'),
  '--dsw-specific-selector': pm('surface'),
  '--dsw-focus-ring-color': pm('accent'),
}

const SANS = 'var(--pm-font-sans)'
const MONO = 'var(--pm-font-mono)'
const FONT_SIZES = { text: '--dsh-content-font-size', code: '--dsh-code-font-size', terminal: '--dsh-terminal-font-size' } as const
const FONT_FAMILIES = { text: '--dsh-font-family-text', code: '--dsh-font-family-code', terminal: '--dsh-font-family-terminal' } as const

export class ThemePresenter {
  #applied: string[] = []
  readonly #meta = document.createElement('meta')

  constructor() {
    this.#meta.name = 'theme-color'
  }

  apply(snapshot: DshThemeSnapshot): void {
    const scheme = snapshot.active.colorScheme
    const root = document.documentElement
    const body = document.body
    root.style.colorScheme = scheme
    root.setAttribute('data-ds-theme-source', snapshot.preference === 'system' ? 'system' : scheme)
    if (scheme === 'dark') body.setAttribute('data-ds-dark-theme', '')
    else body.removeAttribute('data-ds-dark-theme')
    for (const [role, name] of Object.entries(FONT_SIZES)) body.style.setProperty(name, `${snapshot.fontSizes[role as keyof typeof FONT_SIZES]}px`)
    for (const [role, name] of Object.entries(FONT_FAMILIES)) body.style.setProperty(name, snapshot.fontFamilies[role as keyof typeof FONT_FAMILIES] || (role === 'text' ? SANS : MONO))
    for (const name of this.#applied) body.style.removeProperty(name)
    this.#applied = []
    for (const [name, value] of Object.entries(snapshot.active.tokens)) {
      body.style.setProperty(name, value)
      this.#applied.push(name)
    }
    this.#meta.content = getComputedStyle(body).backgroundColor
    if (!this.#meta.isConnected) document.head.append(this.#meta)
  }

  dispose(): void {
    const root = document.documentElement
    const body = document.body
    root.style.removeProperty('color-scheme')
    root.removeAttribute('data-ds-theme-source')
    body.removeAttribute('data-ds-dark-theme')
    for (const name of [...Object.values(FONT_SIZES), ...Object.values(FONT_FAMILIES), ...this.#applied]) body.style.removeProperty(name)
    this.#applied = []
    this.#meta.remove()
  }
}

export function followScheme(snapshot: DshThemeSnapshot): boolean {
  const dark = snapshot.active.colorScheme === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  return dark
}
