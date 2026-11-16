import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { brandMarkup, iconMarkup } from '@lincyaw/design'
import { STARTUP_MESSAGES } from '../startup-messages.ts'

const require = createRequire(import.meta.url)
let assets: { css: string, script: string, version: string } | undefined
export function startupAssets(): { css: string, script: string, version: string } {
  if (!assets) {
    const css = readFileSync(require.resolve('@lincyaw/design/tokens.css'), 'utf8') + '\n'
      + readFileSync(require.resolve('@lincyaw/design/components.css'), 'utf8') + '\n'
      + readFileSync(new URL('../client/startup.css', import.meta.url), 'utf8')
    const script = `(${installStartup.toString()})(${JSON.stringify(STARTUP_MESSAGES)})`
    assets = { css, script, version: createHash('sha256').update(css).update(script).digest('hex').slice(0, 16) }
  }
  return assets
}

/** Runs before the framework entry. Only our own ready event hands over the page; there is no timed dismissal. */
function installStartup(catalog: typeof STARTUP_MESSAGES) {
  const cover = document.getElementById('presmium-startup') as HTMLDialogElement
  const message = cover.querySelector<HTMLElement>('[data-startup-message]')!
  const retry = cover.querySelector<HTMLButtonElement>('[data-startup-retry]')!
  const retrySlot = retry.parentElement!
  const spinner = cover.querySelector<HTMLElement>('[data-startup-spinner]')!
  const details = cover.querySelector<HTMLAnchorElement>('[data-startup-details]')!
  let language = document.documentElement.lang || navigator.language
  let dark = matchMedia('(prefers-color-scheme: dark)').matches
  try {
    language = localStorage.getItem('presmium.startup.locale') || language
    const saved = localStorage.getItem('presmium.startup.dark')
    if (saved !== null) dark = saved === 'true'
  } catch { /* Startup works without browser storage. */ }
  document.documentElement.classList.toggle('dark', dark)
  const t = catalog[language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en']
  message.textContent = t.opening; retry.textContent = t.retry; details.textContent = t.details
  // Browser-owned modal isolation never overwrites the framework's own inert/aria ownership.
  if (typeof cover.showModal === 'function') { if (cover.open) cover.close(); cover.showModal() }
  cover.addEventListener('cancel', event => event.preventDefault())
  let ended = false
  const release = () => {
    if (ended) return
    ended = true; clearTimeout(timer)
    window.removeEventListener('error', failed, true)
    window.removeEventListener('unhandledrejection', failed)
    window.removeEventListener('presmium:workspace-ready', ready)
    window.removeEventListener('presmium:startup-failed', failed)
    if (cover.open) cover.close()
    cover.remove()
  }
  const ready = () => {
    document.documentElement.dataset.pmStartupReadyMs = String(Math.round(performance.now()))
    release()
  }
  const failed = () => { if (ended) return; message.textContent = t.failed; retrySlot.hidden = false; spinner.hidden = true; message.setAttribute('role', 'alert') }
  const timer = window.setTimeout(() => { if (!ended) { message.textContent = t.slow; retrySlot.hidden = false } }, 30_000)
  retry.addEventListener('click', () => location.reload())
  // The untouched framework report is an explicit diagnostic escape, including an early boot/import failure.
  details.addEventListener('click', event => { event.preventDefault(); release() })
  window.addEventListener('presmium:workspace-ready', ready)
  window.addEventListener('presmium:startup-failed', failed)
  window.addEventListener('error', failed, true)
  window.addEventListener('unhandledrejection', failed)
}

export function startupIndex(html: string): string {
  const { version } = startupAssets()
  const initial = STARTUP_MESSAGES[/<html[^>]*lang=["']zh/i.test(html) ? 'zh-CN' : 'en']
  const cover = `<dialog open id="presmium-startup" class="pm-startup pm-ui" aria-labelledby="presmium-startup-title"><div class="pm-startup__content"><h1 id="presmium-startup-title" class="pm-startup__brand">${brandMarkup()}<span>Presmium Studio</span></h1><p class="pm-startup__status" role="status" aria-live="polite"><span data-startup-spinner aria-hidden="true"><span class="pm-ui-loading pm-startup__spinner">${iconMarkup('loading')}</span></span><span data-startup-message>${initial.opening}</span></p><div class="pm-startup__actions"><span hidden><button type="button" class="pm-ui-button pm-ui-button--ghost" data-density="compact" data-startup-retry>${initial.retry}</button></span><a href="#presmium-startup" class="pm-ui-button pm-ui-button--ghost" data-density="compact" data-startup-details>${initial.details}</a></div></div></dialog>`
  return html.replace('</head>', `<link rel="stylesheet" href="api/presmium/startup.css?v=${version}"></head>`)
    .replace(/<body([^>]*)>/, `<body$1>${cover}<script src="api/presmium/startup.js?v=${version}"></script>`)
}
