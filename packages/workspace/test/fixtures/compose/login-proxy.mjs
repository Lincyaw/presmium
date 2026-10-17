// A login proxy for the deploy test, in place of a real identity provider: on the `edge` network at an
// address serve trusts (`--trust-proxy-from`), it forwards every request to serve as oauth2-proxy would
// (the Host kept, the member in X-Forwarded-Email), the member being the one the test names in
// X-Test-Member. Published on a port of the test's machine, as oauth2-proxy is.
import { createServer, request } from 'node:http'

const serve = new URL(process.env.SERVE ?? 'http://serve:4310')
const IDENTITY = ['x-forwarded-user', 'x-forwarded-email', 'x-forwarded-preferred-username', 'x-forwarded-groups']

createServer((req, res) => {
  const headers = { ...req.headers }
  for (const name of IDENTITY) delete headers[name]
  const member = headers['x-test-member']
  delete headers['x-test-member']
  if (typeof member === 'string' && member) headers['x-forwarded-email'] = member
  const upstream = request({ hostname: serve.hostname, port: serve.port, path: req.url, method: req.method, headers }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers)
    answer.pipe(res)
  })
  upstream.on('error', (error) => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end(`login proxy: ${error.message}`)
  })
  req.pipe(upstream)
}).listen(8080, '0.0.0.0')
