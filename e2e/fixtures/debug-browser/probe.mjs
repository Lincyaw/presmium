// Real HTTP and Chromium exercise errors before application startup, including a child frame.
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from '@playwright/test'
import { browserDiagnostics } from '../../../scripts/lib/browser-diagnostics.mjs'

const directory = mkdtempSync(join(tmpdir(), 'presmium-debug-probe-'))
const server = createServer((req, res) => {
  if (req.url.startsWith('/missing.js')) return void res.writeHead(404).end('missing')
  if (req.url === '/unavailable') return void res.writeHead(503).end('not ready')
  if (req.url === '/slow') return void setTimeout(() => res.end('slow'), 150)
  if (req.url === '/pending') return
  if (req.url === '/frame') return void res.end('<script>throw new Error("frame startup failed")</script>')
  res.setHeader('Content-Type', 'text/html')
  res.end(`<script>
    console.error('early console failed token=private-secret');
    fetch('/unavailable'); fetch('/slow'); fetch('/pending');
    Promise.reject(new Error('unhandled promise failed'));
    setTimeout(() => { const until = performance.now() + 100; while (performance.now() < until) {} }, 50);
    setTimeout(() => { throw new Error('startup failed') }, 0);
  </script><script src="/missing.js?token=private-secret"></script><iframe src="/frame"></iframe>`)
})
let browser, capture
try {
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  browser = await chromium.launch()
  const context = await browser.newContext()
  capture = await browserDiagnostics(context, { directory, secrets: ['private-secret'], slowMs: 100 })
  const page = await context.newPage()
  capture.step('probe')
  await page.goto(`http://127.0.0.1:${server.address().port}/?token=private-secret`)
  // Wait for actual observable evidence, rather than assuming the asynchronous callbacks have run.
  for (const until = Date.now() + 5000; ;) {
    const text = readFileSync(join(directory, 'events.jsonl'), 'utf8')
    if (text.includes('browser.longtask') && text.includes('request.slow') && text.includes('frame startup failed')) break
    if (Date.now() > until) throw new Error(`incomplete diagnostics: ${text}`)
    await new Promise(done => setTimeout(done, 50))
  }
  capture.record('backend.log', { message: 'engine unavailable token=private-secret' })
  await capture.snapshot(page, 'failure')
  await browser.close()
  capture.close()
  console.log(JSON.stringify({ summary: capture.summary(), events: readFileSync(join(directory, 'events.jsonl'), 'utf8') }))
} finally {
  await browser?.close()
  capture?.close()
  server.closeAllConnections()
  await new Promise(done => server.close(done))
  rmSync(directory, { recursive: true, force: true })
}
