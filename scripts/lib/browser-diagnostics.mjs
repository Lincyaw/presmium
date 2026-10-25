import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** A local, bounded record of browser and service evidence. No headers, cookies or request bodies are collected. */
export function diagnosticLog({ directory, secrets = [], limit = 2000 }) {
  mkdirSync(directory, { recursive: true })
  const eventsFile = join(directory, 'events.jsonl')
  writeFileSync(eventsFile, '', { mode: 0o600 })
  const events = []
  let dropped = 0
  let step = 'startup'
  let active = true
  const address = value => {
    try {
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol)) return url.protocol
      url.username = ''
      url.password = ''
      url.hash = ''
      for (const key of [...url.searchParams.keys()]) if (!['document', 'form', 'view', 'track', 'section'].includes(key)) url.searchParams.delete(key)
      return url.href
    } catch { return '<invalid URL>' }
  }
  const redact = value => {
    let text = String(value)
    for (const secret of secrets) if (secret) text = text.replaceAll(secret, '[redacted]')
    return text.replace(/https?:\/\/[^\s<>"')]+/g, address)
      .replace(/\bBearer\s+[\w.\-]+/gi, 'Bearer [redacted]')
      .replace(/((?:token|api[_-]?key|secret|password|authorization)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[redacted]')
      .slice(0, 4000)
  }
  const record = (kind, data = {}) => {
    if (!active) return
    if (events.length >= limit) { dropped++; return }
    const event = JSON.parse(JSON.stringify({ at: new Date().toISOString(), step, kind, ...data }, (_key, value) => typeof value === 'string' ? redact(value) : value))
    events.push(event)
    appendFileSync(eventsFile, `${JSON.stringify(event)}\n`)
  }
  return {
    record, redact, address,
    get currentStep() { return step },
    addSecrets(values) { secrets.push(...values) },
    step(value) { step = value; record('step.started') },
    summary() {
      const problems = events.filter(event => ['browser.error', 'browser.crash', 'http.error', 'request.failed', 'console.error', 'preview.failed', 'debug.failed'].includes(event.kind)
        || (event.kind === 'backend.log' && /\b(?:failed|error:|unavailable|silent-fallback)\b/i.test(event.message)))
      return { events: events.length, dropped, problems: problems.slice(0, 20), counts: Object.fromEntries([...new Set(events.map(event => event.kind))].map(kind => [kind, events.filter(event => event.kind === kind).length])) }
    },
    close() { if (active) record('capture.ended', { dropped }); active = false },
  }
}

export async function browserDiagnostics(context, { directory, secrets = [], slowMs = 1000, limit = 2000, log = diagnosticLog({ directory, secrets, limit }) }) {
  const { record, redact, address } = log
  const pending = new Map()
  const disposers = []
  const bounded = async work => {
    let timer
    try { return await Promise.race([work, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('DOM snapshot timed out after 3000 ms')), 3000) })]) }
    finally { clearTimeout(timer) }
  }
  const listen = (target, event, listener) => {
    target.on(event, listener)
    disposers.push(() => target.off(event, listener))
  }
  const pages = new Set()
  const pageOf = page => {
    if (pages.has(page)) return
    pages.add(page)
    listen(page, 'pageerror', error => record('browser.error', { message: error.message, stack: error.stack }))
    listen(page, 'crash', () => record('browser.crash', { url: address(page.url()) }))
    listen(page, 'console', message => {
      if (['error', 'warning'].includes(message.type())) record(`console.${message.type()}`, { message: message.text(), location: message.location() })
    })
    listen(page, 'framenavigated', frame => record('frame.navigation', { url: address(frame.url()), main: frame === page.mainFrame() }))
  }
  context.pages().forEach(pageOf)
  listen(context, 'page', pageOf)
  listen(context, 'request', request => {
    if (pending.size < 1000) pending.set(request, { at: Date.now(), step: log.currentStep })
    else record('request.overflow')
  })
  listen(context, 'response', response => {
    if (response.status() >= 400) record('http.error', { url: address(response.url()), status: response.status(), resource: response.request().resourceType() })
  })
  const finished = (request, failed) => {
    const started = pending.get(request)
    pending.delete(request)
    const elapsedMs = started ? Date.now() - started.at : undefined
    if (failed || elapsedMs >= slowMs) record(failed ? request.failure()?.errorText?.includes('ERR_ABORTED') ? 'request.cancelled' : 'request.failed' : 'request.slow', {
      url: address(request.url()), resource: request.resourceType(), method: request.method(), elapsedMs,
      startedStep: started?.step, ...failed ? { error: request.failure()?.errorText } : {},
    })
  }
  listen(context, 'requestfinished', request => finished(request, false))
  listen(context, 'requestfailed', request => finished(request, true))
  await context.exposeBinding('__presmiumDebugLongTask', ({ frame }, duration) => record('browser.longtask', { url: address(frame.url()), durationMs: duration }))
  await context.exposeBinding('__presmiumDebugPreview', ({ frame }, message) => record('preview.message', { url: address(frame.url()), ...message }))
  await context.addInitScript(() => {
    window.addEventListener('message', event => {
      const message = event.data
      if (message?.protocol !== 'presmium-preview' || !['ready', 'updated', 'activity', 'report'].includes(message.type)) return
      const { type, document, renderer, revision, active, error, level, plugin, message: text } = message
      void window.__presmiumDebugPreview({ type, document, renderer, revision, active, error, level, plugin, message: text }).catch(() => {})
    })
    if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) void window.__presmiumDebugLongTask(entry.duration).catch(() => {})
    }).observe({ type: 'longtask', buffered: true })
  })
  return {
    record,
    redact,
    step: log.step,
    summary: log.summary,
    async snapshot(page, name) {
      // Take the pending list before screenshot/DOM requests: a hung renderer must not hide network evidence.
      record('snapshot', { name, pending: [...pending].filter(([request]) => !['eventsource', 'websocket'].includes(request.resourceType())).slice(-40).map(([request, started]) => ({ url: address(request.url()), resource: request.resourceType(), elapsedMs: Date.now() - started.at, step: started.step })) })
      try {
        const frames = await bounded(page.locator('iframe[data-preview-cache]').evaluateAll(frames => frames.map(frame => ({ src: frame.src, hidden: frame.hidden, renderer: frame.dataset.renderer, document: frame.dataset.document, active: frame.dataset.active }))))
        record('preview.frames', { frames })
      } catch (error) { record('snapshot.error', { message: error.message }) }
      try { await page.screenshot({ path: join(directory, `${name}.png`), timeout: 5000 }) }
      catch (error) { record('screenshot.error', { message: error.message }) }
    },
    close() {
      log.close()
      disposers.forEach(dispose => dispose())
    },
  }
}
