import { messages } from './messages.ts'

const key = (name: string) => `presmium.execJupyter.token:${name}`

function storage(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  } catch {
    return undefined
  }
}

function storedToken(name: string): string | undefined {
  return storage()?.getItem(key(name)) ?? undefined
}

export function forgetToken(name: string): void {
  storage()?.removeItem(key(name))
}

const asking = new Map<string, Promise<string | undefined>>()

export function tokenFor(name: string, origin: string): Promise<string | undefined> {
  const stored = storedToken(name)
  if (stored) return Promise.resolve(stored)
  let pending = asking.get(name)
  if (!pending) {
    pending = ask(name, origin).then((token) => {
      if (token) storage()?.setItem(key(name), token)
      return token
    }).finally(() => asking.delete(name))
    asking.set(name, pending)
  }
  return pending
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function ask(name: string, origin: string): Promise<string | undefined> {
  const t = messages()
  const dialog = element('dialog', 'pm-jupyter-token pm-ui')
  dialog.setAttribute('aria-labelledby', 'pm-jupyter-token-title')
  const header = element('div', 'pm-ui-dialog__header')
  const title = element('h2', 'pm-ui-dialog__title', t.tokenTitle(name))
  title.id = 'pm-jupyter-token-title'
  header.append(title)
  const form = element('form', 'pm-ui-dialog__body')
  form.method = 'dialog'
  const help = element('p', '', t.tokenHelp(origin))
  const label = element('label', 'pm-ui-field')
  const input = element('input', 'pm-ui-input')
  input.type = 'password'
  input.name = 'token'
  input.autocomplete = 'off'
  input.required = true
  label.append(element('span', 'pm-ui-field__label', t.tokenLabel), input)
  const buttons = element('div', '')
  const cancel = element('button', 'pm-ui-button', t.tokenCancel)
  cancel.type = 'button'
  const connect = element('button', 'pm-ui-button pm-ui-button--primary', t.tokenConnect)
  connect.type = 'submit'
  connect.value = 'connect'
  buttons.append(cancel, connect)
  form.append(help, label, buttons)
  dialog.append(header, form)
  Object.assign(dialog.style, { width: 'min(28rem, calc(100vw - 2rem))', padding: '0', border: '1px solid var(--pm-color-line)', borderRadius: 'var(--pm-radius-panel)', background: 'var(--pm-color-surface)', boxShadow: 'var(--pm-shadow-float)' })
  Object.assign(form.style, { display: 'grid', gap: 'var(--pm-space-3)' })
  help.style.margin = '0'
  Object.assign(buttons.style, { display: 'flex', gap: 'var(--pm-space-2)', justifyContent: 'flex-end' })
  document.body.append(dialog)
  return new Promise((resolve) => {
    cancel.addEventListener('click', () => dialog.close(''))
    dialog.addEventListener('close', () => {
      const token = dialog.returnValue === 'connect' ? input.value.trim() : ''
      dialog.remove()
      resolve(token || undefined)
    }, { once: true })
    dialog.showModal()
    input.focus()
  })
}
