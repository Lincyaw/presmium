import { invoke } from '@tauri-apps/api/core'
import { brandMarkup, iconMarkup } from '@lincyaw/design'
import { LAUNCHER_MESSAGES } from './messages.ts'
import type { LaunchError, Locale } from './messages.ts'

interface LauncherState {
  /** The system's language, as the app's menu uses it. */
  locale: Locale
  recent: string[]
  /** Once per run: the last workspace, or an editable bundled gallery on first launch. */
  reopen: string | null
}

const state = await invoke<LauncherState>('launcher_state')
const t = LAUNCHER_MESSAGES[state.locale] ?? LAUNCHER_MESSAGES.en
document.documentElement.lang = state.locale

const updateButton = document.getElementById('desktop-update') as HTMLButtonElement
let unsubscribeUpdates: (() => void) | undefined
const connectUpdates = () => {
  const host = window.presmiumDesktop
  if (!host) return
  unsubscribeUpdates?.()
  const paint = () => {
    const snapshot = host.getSnapshot(), update = snapshot.update
    const label = update.phase === 'downloading' ? t.updates.downloading(update.progress) : t.updates[update.phase]
    document.getElementById('desktop-update-slot')!.hidden = !update.version
    updateButton.disabled = ['checking', 'downloading', 'installing'].includes(update.phase)
    const name = ['checking', 'downloading', 'installing'].includes(update.phase) ? 'loading'
      : update.phase === 'available' ? 'download' : update.phase === 'error' ? 'warning' : 'refresh'
    updateButton.innerHTML = `<span class="${name === 'loading' ? 'pm-ui-loading' : 'pm-ui-icon'}" aria-hidden="true">${iconMarkup(name)}</span>`
    updateButton.setAttribute('aria-label', `${t.updates.version(snapshot.version)} · ${label}`)
    updateButton.title = `${t.updates.version(snapshot.version)} · ${label}`
  }
  unsubscribeUpdates = host.subscribe(paint)
  updateButton.onclick = () => void host.activateUpdate().catch(() => { updateButton.title = t.updates.error })
  paint()
}
window.addEventListener('presmium-desktop-ready', connectUpdates)
window.addEventListener('pagehide', () => unsubscribeUpdates?.(), { once: true })
connectUpdates()

const dark = matchMedia('(prefers-color-scheme: dark)')
const theme = () => document.documentElement.classList.toggle('dark', dark.matches)
dark.addEventListener('change', theme)
theme()

const root = document.getElementById('launcher')!
const ERRORS = new Set<string>(Object.keys(t.errors))

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

function element<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

function icon(name: Parameters<typeof iconMarkup>[0]): Node {
  return element('span', { innerHTML: iconMarkup(name), ariaHidden: 'true', className: 'launcher__icon' })
}

function header(): Node {
  const brand = element('h1', { className: 'launcher__brand', innerHTML: brandMarkup() })
  brand.append('Presmium Studio')
  return brand
}

function render(state: LauncherState, error?: LaunchError): void {
  root.classList.remove('launcher--starting')
  const open = element('button', { type: 'button', className: 'pm-ui-button pm-ui-button--primary' }, icon('folder'), t.open)
  open.addEventListener('click', () => void choose(state))
  const nodes: Node[] = [header(), element('p', { className: 'launcher__lead' }, t.lead)]
  if (error) {
    const details = element('button', { type: 'button', className: 'pm-ui-button pm-ui-button--small pm-ui-button--ghost' }, t.details)
    details.addEventListener('click', () => void invoke('show_details'))
    nodes.push(element('div', { className: 'pm-ui-notice pm-ui-notice--danger launcher__status', role: 'alert' }, icon('error'), t.errors[error], details))
  }
  nodes.push(element('div', { className: 'launcher__actions' }, open))
  if (state.recent.length > 0) {
    const list = element('ul', { className: 'pm-ui-document-list' })
    for (const path of state.recent) {
      const body = element('button', { type: 'button', className: 'pm-ui-document-list__body' },
        element('span', { className: 'pm-ui-document-list__title' }, folderName(path)),
        element('span', { className: 'pm-ui-document-list__meta' }, path))
      body.addEventListener('click', () => void openWorkspace(state, path))
      const remove = element('button', { type: 'button', className: 'pm-ui-icon-button pm-ui-icon-button--small', title: t.remove, ariaLabel: t.remove }, icon('close'))
      remove.addEventListener('click', async () => {
        render({ ...state, recent: await invoke<string[]>('forget_workspace', { path }) })
      })
      list.append(element('li', { className: 'pm-ui-document-list__row' },
        element('span', { className: 'pm-ui-document-list__icon' }, icon('folder')), body,
        element('span', { className: 'pm-ui-document-list__actions' }, remove)))
    }
    nodes.push(element('section', { className: 'launcher__section' }, element('h2', { className: 'pm-ui-heading' }, t.recent), list))
  }
  root.replaceChildren(...nodes)
}

function renderStarting(path: string): void {
  root.classList.add('launcher--starting')
  root.replaceChildren(header(), element('p', { className: 'launcher__status', role: 'status' },
    element('span', { innerHTML: iconMarkup('loading'), ariaHidden: 'true', className: 'pm-ui-loading launcher__icon' }), t.starting(folderName(path))))
}

async function openWorkspace(state: LauncherState, path: string): Promise<void> {
  renderStarting(path)
  try {
    // On success the window leaves this page for Studio.
    await invoke('open_workspace', { path })
  } catch (code) {
    const recent = await invoke<LauncherState>('launcher_state').then(next => next.recent, () => state.recent)
    render({ ...state, recent }, ERRORS.has(String(code)) ? code as LaunchError : 'start-failed')
  }
}

async function choose(state: LauncherState): Promise<void> {
  const path = await invoke<string | null>('choose_workspace')
  if (path) await openWorkspace(state, path)
}

const query = new URLSearchParams(location.search)
const asked = query.get('workspace')
const ended = query.get('error')
if (asked) await openWorkspace(state, asked)
else if (ended && ERRORS.has(ended)) render(state, ended as LaunchError)
else if (state.reopen) await openWorkspace(state, state.reopen)
else render(state)
