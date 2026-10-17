/**
 * The owner console (SHARED, docs/architecture.md 10.4; design-v0.7.md
 * deviation 37): Presmium's own static page on the console's host name. It
 * shows nothing of a deck: approvals (their description, code and diffs) are
 * plain text, set with `textContent`. Its script is a file of its own, so
 * the page's policy allows no inline script; no other site may frame it.
 */
import { deckLocale, escapeHtml } from '@presmium/kernel'
import { CONSOLE_MESSAGES } from './messages.ts'

/** Headers of every console response. */
export const CONSOLE_HEADERS = {
  'Content-Security-Policy': `default-src 'self'; frame-ancestors 'none'`,
  'Cross-Origin-Opener-Policy': 'same-origin',
  // No page of the site (or any other origin) embeds a console response, not even as an image or a script.
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
} as const

/** The header a state-changing console request carries: not CORS-safelisted, so a site page cannot send it across origins without a preflight serve never allows. */
export const CONSOLE_HEADER = 'Presmium-Console'

export const CONSOLE_SCRIPT_PATH = '/__presmium/presmium.server/console.js'

/**
 * The console's page in the language of the owner's browser (its first
 * `Accept-Language`, as `deckLocale` reads a language; N-07). Its script reads
 * its words from the page (`#messages`), so it chooses no language itself.
 */
export function consolePage(acceptLanguage?: string): string {
  const locale = deckLocale(acceptLanguage?.split(/[,;]/)[0]?.trim())
  const t = CONSOLE_MESSAGES[locale]
  const e = escapeHtml
  // In a JSON script element `<` would end the element; escaped, it reads the same.
  const words = JSON.stringify(t.script).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(t.title)}</title>
<script type="application/json" id="messages">${words}</script>
<script type="module" src="${CONSOLE_SCRIPT_PATH}"></script>
</head>
<body>
<h1>${e(t.heading)}</h1>
<p id="state">${e(t.connecting)}</p>
<h2>${e(t.approvals)}</h2>
<ul id="approvals"></ul>
<p id="none">${e(t.none)}</p>
<h2>${e(t.routes)}</h2>
<form id="send">
<label>${e(t.route)} <select id="route"></select></label>
<label>${e(t.rest)} <input id="rest" type="text"></label>
<label>${e(t.file)} <input id="file" type="file"></label>
<button type="submit">${e(t.send)}</button>
</form>
<pre id="result"></pre>
</body>
</html>
`
}

/** The console's script: its own control channel, the approvals as text, and sending a file to an owner route. */
export const CONSOLE_SCRIPT = `const t = JSON.parse(document.getElementById('messages').textContent)
const id = Math.random().toString(36).slice(2, 12)
const list = document.getElementById('approvals')
const none = document.getElementById('none')
const state = document.getElementById('state')
const items = new Map()
const post = (path, body, headers = {}) => fetch(path, { method: 'POST', headers: { 'Presmium-Console': '1', ...headers }, body })
function refresh() { none.hidden = items.size > 0 }
function add({ id: approval, request }) {
  if (items.has(approval)) return
  const li = document.createElement('li')
  li.dataset.approval = approval
  const title = document.createElement('p')
  title.className = 'title'
  title.textContent = request.title
  const from = document.createElement('p')
  from.textContent = t.from + ' ' + request.from + (request.member ? ' · ' + t.member + ' ' + request.member : '')
  li.append(title, from)
  if (request.detail) {
    const detail = document.createElement('pre')
    detail.textContent = request.detail
    li.append(detail)
  }
  for (const [label, allow] of [[t.allow, true], [t.deny, false]]) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', async () => {
      const response = await post('/__presmium/presmium.server/control', JSON.stringify({ window: id, type: 'answer', id: approval, allow }), { 'Content-Type': 'application/json' })
      if (response.ok) remove(approval)
      else state.textContent = response.status + ' ' + (await response.text())
    })
    li.append(button)
  }
  items.set(approval, li)
  list.append(li)
  refresh()
}
function remove(approval) {
  items.get(approval)?.remove()
  items.delete(approval)
  refresh()
}
const source = new EventSource('/__presmium/presmium.server/control?console=1&window=' + id)
source.addEventListener('open', () => { state.textContent = t.connected })
source.addEventListener('error', () => { state.textContent = t.lost })
source.addEventListener('approval', event => add(JSON.parse(event.data)))
source.addEventListener('settled', event => remove(JSON.parse(event.data).id))
refresh()

const select = document.getElementById('route')
fetch('/__presmium/presmium.server/routes').then(r => r.json()).then(({ routes }) => {
  for (const route of routes) {
    const option = document.createElement('option')
    option.value = JSON.stringify(route)
    option.textContent = (route.document ? route.document + ': ' : '') + route.plugin + '/' + route.path
    select.append(option)
  }
})
document.getElementById('send').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!select.value) return
  const route = JSON.parse(select.value)
  const file = document.getElementById('file').files[0]
  const path = route.path.endsWith('/*') ? route.path.slice(0, -1) + document.getElementById('rest').value.replace(/^\\/+/, '') : route.path
  const response = await post('/__presmium/' + route.plugin + '/' + path, file ?? '', { 'Presmium-Document': encodeURIComponent(route.document) })
  document.getElementById('result').textContent = response.status + '\\n' + await response.text()
})
`
