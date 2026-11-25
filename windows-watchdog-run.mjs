import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

assert.equal(process.platform, 'win32', 'Run this process-tree fixture on real Windows')
const self = fileURLToPath(import.meta.url)
const [mode, directory] = process.argv.slice(2)
if (mode === '--grandchild' || mode === '--unrelated') {
  process.chdir(directory)
  writeFileSync(join(directory, `${mode.slice(2)}.json`), JSON.stringify({ pid: process.pid }))
  setInterval(() => {}, 1000)
} else if (mode === '--tree-child') {
  process.chdir(directory)
  const grandchild = spawn(process.execPath, [self, '--grandchild', directory], { cwd: directory, stdio: 'ignore', detached: true })
  grandchild.on('error', error => { console.error(error); process.exit(1) })
  grandchild.unref()
  writeFileSync(join(directory, 'child.json'), JSON.stringify({ pid: process.pid, grandchild: grandchild.pid }))
  setInterval(() => { if (existsSync(join(directory, 'exit-child'))) process.exit(0) }, 25)
} else {
  const watchdogFile = fileURLToPath(new URL('./packages/dsh/src/node/watchdog.mjs', import.meta.url))
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const base = mkdtempSync(join(tmpdir(), "presmium-watchdog-'中文-"))
  const watched = new Set()
  const output = new WeakMap()
  const track = child => {
    watched.add(child)
    output.set(child, '')
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', chunk => output.set(child, (output.get(child) + chunk).slice(-16000)))
    child.stdin?.on('error', () => {})
    return child
  }
  const waitFor = async (condition, label, timeout = 20000) => {
    const end = Date.now() + timeout
    for (;;) { const found = await condition(); if (found) return found; if (Date.now() > end) throw new Error(`Timed out: ${label}`); await delay(25) }
  }
  const exited = child => child.exitCode !== null || child.signalCode !== null
  const waitExit = child => waitFor(() => exited(child), `process ${child.pid} exit; ${output.get(child) ?? ''}`)
  const readyJson = (file, owner) => waitFor(() => {
    try { return JSON.parse(readFileSync(file, 'utf8')) } catch {}
    if (owner && exited(owner)) throw new Error(`Process exited before ${file}: ${output.get(owner) ?? ''}`)
    return undefined
  }, file)
  const passed = []
  let unrelated
  try {
    const unrelatedDir = join(base, 'unrelated')
    mkdirSync(unrelatedDir)
    unrelated = track(spawn(process.execPath, [self, '--unrelated', unrelatedDir], { cwd: unrelatedDir, stdio: 'ignore' }))
    assert.equal((await readyJson(join(unrelatedDir, 'unrelated.json'), unrelated)).pid, unrelated.pid)

    for (const action of ['stdin-close', 'force-kill-watchdog', 'normal-child-exit']) {
      const state = join(base, action)
      mkdirSync(state)
      const watchdog = track(spawn(process.execPath, [watchdogFile, process.execPath, self, '--tree-child', state], { cwd: state, detached: true, stdio: ['pipe', 'pipe', 'pipe'] }))
      const child = await readyJson(join(state, 'child.json'), watchdog)
      const grandchild = await readyJson(join(state, 'grandchild.json'), watchdog)
      assert.equal(child.grandchild, grandchild.pid)
      // Open and retain exact process handles before any termination. This avoids
      // PID enumeration and makes recycled PIDs irrelevant to the assertions.
      const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$watchdog = [Diagnostics.Process]::GetProcessById(${watchdog.pid})
$child = [Diagnostics.Process]::GetProcessById(${child.pid})
$grandchild = [Diagnostics.Process]::GetProcessById(${grandchild.pid})
$unrelated = [Diagnostics.Process]::GetProcessById(${unrelated.pid})
$processes = @($watchdog, $child, $grandchild, $unrelated)
foreach ($process in $processes) { $null = $process.Handle }
[Console]::WriteLine('PROCESS_HANDLES_READY')
$command = [Console]::In.ReadLine()
try {
  if ($command -ne 'check') { throw 'The fixture requested cleanup' }
  foreach ($process in @($watchdog, $child, $grandchild)) {
    if (-not $process.WaitForExit(15000)) { throw ('Owned process survived: ' + $process.Id) }
  }
  if ($unrelated.HasExited) { throw 'The unrelated Node process was killed' }
  [Console]::WriteLine('OWNED_TREE_EXITED_UNRELATED_ALIVE')
} finally {
  foreach ($process in @($watchdog, $child, $grandchild)) {
    try { if (-not $process.HasExited) { $process.Kill(); $null = $process.WaitForExit(5000) } } catch {}
  }
  foreach ($process in $processes) { $process.Dispose() }
}
`
      const monitor = track(spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }))
      try {
        await waitFor(() => { if (exited(monitor)) throw new Error(output.get(monitor)); return output.get(monitor).includes('PROCESS_HANDLES_READY') }, 'retained process handles')
        if (action === 'stdin-close') watchdog.stdin.end()
        else if (action === 'force-kill-watchdog') assert.equal(watchdog.kill('SIGKILL'), true)
        else writeFileSync(join(state, 'exit-child'), 'exit normally')
        monitor.stdin.end('check\n')
        await waitExit(monitor)
        assert.equal(monitor.exitCode, 0, output.get(monitor))
        assert.ok(output.get(monitor).includes('OWNED_TREE_EXITED_UNRELATED_ALIVE'), output.get(monitor))
        await waitExit(watchdog)
        assert.equal(exited(unrelated), false, 'The unrelated Node must remain alive across scenarios')
        rmSync(state, { recursive: true, force: true, maxRetries: 3 })
        passed.push(action)
        console.log(JSON.stringify({ action, watchdog: watchdog.pid, child: child.pid, grandchild: grandchild.pid, unrelatedAlive: true, removedWorkingDirectory: true }))
      } finally { monitor.stdin?.end(); if (!exited(watchdog)) watchdog.kill('SIGKILL') }
    }
    console.log(JSON.stringify({ platform: process.platform, node: process.version, passed, unrelatedUnaffected: true }))
  } finally {
    for (const child of watched) if (!exited(child)) { child.stdin?.end(); child.kill('SIGKILL') }
    await Promise.all([...watched].map(child => waitExit(child).catch(() => {})))
    rmSync(base, { recursive: true, force: true, maxRetries: 3 })
  }
}
