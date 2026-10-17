// Dropping privileges (F-05, docs/architecture.md 10.5): `presmium gateway` started as root reads its token
// file, then runs as its user with the user's supplementary groups of /etc/group (the group that may write the
// document directories), and cannot read the token file any more. Root is needed, so it runs in a container of
// the node image (skipped, with the reason, where Docker or the image is not there).
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const IMAGE = 'node:22-trixie-slim'

/** Why the container cannot run here; undefined when it can. */
function unavailable(): string | undefined {
  const docker = spawnSync('docker', ['image', 'inspect', IMAGE], { encoding: 'utf8' })
  if (docker.error) return 'Docker is not installed'
  if (docker.status !== 0) return `the image ${IMAGE} is not here (docker pull ${IMAGE})`
  return undefined
}

const SCRIPT = `set -e
groupadd -g 1100 documents && useradd -u 1003 -U gateway && usermod -aG documents gateway
mkdir -p /work && printf 'settings: {}\\n' > /work/presmium.workspace.yaml
printf 'service-token\\n' > /run/gateway-token && chmod 600 /run/gateway-token
PRESMIUM_GATEWAY_TOKEN_FILE=/run/gateway-token node /repo/packages/cli/bin/presmium.mjs gateway /work --user gateway --port 4320 --operator-dir /tmp/operator > /tmp/out 2>&1 &
pid=$!
for i in $(seq 1 150); do grep -q '^gateway ' /tmp/out && break; sleep 0.2; done
grep -E '^(Uid|Groups):' /proc/$pid/status
echo "/etc/group: $(id -G gateway)"
node -e "fetch('http://127.0.0.1:4320/info', { headers: { Authorization: 'Bearer service-token' } }).then(r => console.log('info', r.status))"
echo "token: $(su gateway -s /bin/sh -c 'cat /run/gateway-token' 2>/dev/null || echo unreadable)"
kill $pid
`

const reason = unavailable()

it.skipIf(reason)(`presmium gateway started as root runs as its user with the user's groups of /etc/group${reason ? ` (skipped: ${reason})` : ''}`, () => {
  const run = spawnSync('docker', ['run', '--rm', '-v', `${ROOT}:/repo:ro`, IMAGE, 'sh', '-c', SCRIPT], { encoding: 'utf8', timeout: 150_000 })
  const output = `${run.stdout}${run.stderr}`
  expect(run.status, output).toBe(0)
  expect(output).toMatch(/^Uid:\s+1003\s+1003\s+1003\s+1003$/m)
  const groups = /^Groups:\s+([\d ]+)$/m.exec(output)?.[1]?.trim().split(/\s+/).sort()
  const listed = /^\/etc\/group: ([\d ]+)$/m.exec(output)?.[1]?.trim().split(/\s+/).sort()
  expect(groups).toEqual(['1003', '1100'])
  expect(groups).toEqual(listed)
  expect(output).toContain('info 200')
  expect(output).toContain('token: unreadable')
}, 180_000)
