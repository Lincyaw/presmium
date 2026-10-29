// Presentation only. Keycloak owns forms, actions, validation, password reveal, and locale selection.
(() => {
  const key = 'presmium.auth.appearance'
  const explicit = new URLSearchParams(location.search).get('ui_theme')
  const valid = (value) => value === 'light' || value === 'dark'
  let selected = valid(explicit) ? explicit : null
  try {
    if (selected) sessionStorage.setItem(key, selected)
    else {
      const stored = sessionStorage.getItem(key)
      if (valid(stored)) selected = stored
    }
  } catch { /* Blocked storage still permits the current page's explicit appearance. */ }
  const system = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => document.documentElement.classList.toggle('dark', selected ? selected === 'dark' : system.matches)
  apply()
  system.addEventListener('change', apply)

  document.addEventListener('DOMContentLoaded', () => {
    const brand = document.getElementById('kc-header-wrapper')
    if (brand && typeof globalThis.PresmiumBrandMarkup === 'string') {
      const mark = document.createElement('span')
      mark.setAttribute('aria-hidden', 'true')
      mark.innerHTML = globalThis.PresmiumBrandMarkup
      brand.prepend(mark)
      brand.classList.add('pm-auth__brand-content')
    }
    // These official base-template nodes have no theme.properties class slot.
    document.getElementById('kc-page-title')?.classList.add('pm-ui-card__title')
    const localeButton = document.getElementById('kc-current-locale-link')
    if (localeButton && typeof globalThis.PresmiumLanguageIconMarkup === 'string') {
      const currentLocale = localeButton.textContent.trim()
      const icon = document.createElement('span')
      icon.innerHTML = globalThis.PresmiumLanguageIconMarkup
      const label = document.createElement('span')
      label.className = 'pm-ui-sr-only'
      label.textContent = currentLocale
      localeButton.title = `${localeButton.getAttribute('aria-label')} · ${currentLocale}`
      localeButton.classList.add('pm-ui-icon-button', 'pm-ui-icon-button--small')
      // Retain the official button node, ARIA attributes, and its native menu listeners.
      localeButton.replaceChildren(...icon.childNodes, label)
    }
    document.querySelectorAll('a:not(.pm-ui-button):not(.pm-ui-menu__item)').forEach((node) => node.classList.add('pm-ui-link'))
    document.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((node) => node.classList.add('pm-ui-checkbox'))
    document.querySelectorAll('select.pm-ui-input').forEach((node) => node.classList.replace('pm-ui-input', 'pm-ui-select'))
    document.querySelectorAll('textarea.pm-ui-input').forEach((node) => node.classList.replace('pm-ui-input', 'pm-ui-textarea'))
    document.querySelectorAll('.subtitle, .instruction').forEach((node) => node.classList.add('pm-ui-field__hint'))
    const tones = { error: 'danger', warning: 'warn', success: 'ok', info: 'accent' }
    for (const [type, tone] of Object.entries(tones)) {
      document.querySelectorAll(`.pm-ui-notice.alert-${type}`).forEach((node) => node.classList.add(`pm-ui-notice--${tone}`))
    }
    document.querySelectorAll('[data-password-toggle]').forEach((button) => {
      // The official passwordVisibility.js updates its first child's class and its own aria-label.
      // Keep that child and handler intact, and show the translated accessible name as button text.
      if (button.firstElementChild) button.firstElementChild.hidden = true
      const label = document.createElement('span')
      label.className = 'pm-ui-button__content'
      label.setAttribute('aria-hidden', 'true')
      const update = () => { label.textContent = button.getAttribute('aria-label') ?? '' }
      button.append(label)
      update()
      new MutationObserver(update).observe(button, { attributes: true, attributeFilter: ['aria-label'] })
    })
    document.querySelectorAll('input[aria-invalid="true"]').forEach((input) => {
      const error = document.getElementById(`input-error-${input.id}`)
        ?? input.closest('.pm-ui-field')?.querySelector('.pm-ui-field__error[id]')
      if (error && !input.hasAttribute('aria-describedby')) input.setAttribute('aria-describedby', error.id)
    })
  })
})()
