/**
 * The learner's token of an `auth: prompt` environment (P-105): asked for in
 * a dialog the first time the page needs it, kept in this page's
 * `sessionStorage` only (the tab's, cleared when it closes), sent to the
 * environment's address only. A token the server refuses is forgotten.
 */
import { messages } from './messages.ts'

const key = (name: string) => `presmium.execJupyter.token:${name}`

function storage(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  } catch {
    return undefined
  }
}

export function storedToken(name: string): string | undefined {
  return storage()?.getItem(key(name)) ?? undefined
}

export function forgetToken(name: string): void {
  storage()?.removeItem(key(name))
}

const asking = new Map<string, Promise<string | undefined>>()

/** The environment's token: the stored one, else what the learner pastes; undefined when they cancel. */
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

/** A modal dialog with one password field. */
function ask(name: string, origin: string): Promise<string | undefined> {
  const t = messages()
  const dialog = document.createElement('dialog')
  dialog.className = 'pm-jupyter-token'
  dialog.setAttribute('aria-labelledby', 'pm-jupyter-token-title')
  const form = document.createElement('form')
  form.method = 'dialog'
  const title = document.createElement('h2')
  title.id = 'pm-jupyter-token-title'
  title.textContent = t.tokenTitle(name)
  const help = document.createElement('p')
  help.textContent = t.tokenHelp(origin)
  const label = document.createElement('label')
  label.textContent = t.tokenLabel
  const input = document.createElement('input')
  input.type = 'password'
  input.name = 'token'
  input.autocomplete = 'off'
  input.required = true
  label.append(input)
  const buttons = document.createElement('div')
  buttons.className = 'pm-jupyter-token__buttons'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.textContent = t.tokenCancel
  const connect = document.createElement('button')
  connect.type = 'submit'
  connect.value = 'connect'
  connect.textContent = t.tokenConnect
  buttons.append(cancel, connect)
  form.append(title, help, label, buttons)
  dialog.append(form)
  Object.assign(dialog.style, { maxWidth: '28rem', padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid #8886', font: 'inherit' })
  Object.assign(input.style, { display: 'block', width: '100%', margin: '0.25rem 0 0.75rem', font: 'inherit', padding: '0.25rem' })
  Object.assign(buttons.style, { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' })
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
