import { invoke } from '@tauri-apps/api/core'
import { brandMarkup, iconMarkup } from '@lincyaw/design'
import { LAUNCHER_MESSAGES } from './messages.ts'
import type { LaunchError, Locale } from './messages.ts'

interface LauncherState {
  /** The system's language, as the app's menu uses it. */
  locale: Locale
  recent: string[]
  /** The workspace to reopen, given once per app run: the last one opened, as an editor reopens its folder. */
  reopen: string | null
}

const state = await invoke<LauncherState>('launcher_state')
const t = LAUNCHER_MESSAGES[state.locale] ?? LAUNCHER_MESSAGES.en
document.documentElement.lang = state.locale

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
