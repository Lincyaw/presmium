import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { lstatSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { privateWindowsRunHome } from './packages/compiler/src/windows-run-home.ts'

assert.equal(process.platform, 'win32', 'Run this fixture on a real Windows host')
assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Use Node 24 native TypeScript loading')
const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const literal = value => `'${value.replaceAll("'", "''")}'`
const ps = body => execFileSync(powershell, [
  '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
  Buffer.from(`$ErrorActionPreference = 'Stop'\n[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n${body}`, 'utf16le').toString('base64'),
], { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 1 << 20, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const version = ps('$PSVersionTable.PSVersion.ToString()')
assert.match(version, /^5\.1\./, 'Use the operating system Windows PowerShell 5.1')

const base = mkdtempSync(join(tmpdir(), "presmium-run-home-'中文-"))
const markerName = "保留的内容'original.txt"
const markerBytes = Buffer.from('Keep this existing content unchanged. 中文\n', 'utf8')
const passed = []
const aclOf = path => ps(`([IO.${statSync(path).isDirectory() ? 'DirectoryInfo' : 'FileInfo'}]::new(${literal(path)})).GetAccessControl().GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]'Access,Owner,Group')`)
const snapshot = directory => ({
  directoryAcl: aclOf(directory),
  markerAcl: aclOf(join(directory, markerName)),
  content: readFileSync(join(directory, markerName)).toString('base64'),
})
const marker = directory => writeFileSync(join(directory, markerName), markerBytes)
const addEveryone = (directory, inheritOnly) => ps(`
$path = ${literal(directory)}
$item = [IO.DirectoryInfo]::new($path)
$acl = $item.GetAccessControl()
$everyone = [Security.Principal.SecurityIdentifier]::new('S-1-1-0')
$rule = [Security.AccessControl.FileSystemAccessRule]::new($everyone, 'FullControl', 'ContainerInherit,ObjectInherit', '${inheritOnly ? 'InheritOnly' : 'None'}', 'Allow')
$acl.AddAccessRule($rule)
$item.SetAccessControl($acl)
`)
const rejectedUnchanged = (directory, label) => {
  const before = snapshot(directory)
  assert.throws(() => privateWindowsRunHome(directory), undefined, `${label} must be rejected`)
  assert.deepEqual(snapshot(directory), before, `${label} rejection must preserve content and ACLs`)
  passed.push(label)
}

try {
  const home = join(base, "fresh-'合法中文")
  privateWindowsRunHome(home)
  assert.ok(lstatSync(home).isDirectory())
  assert.equal(lstatSync(home).isSymbolicLink(), false)
  assert.equal(ps(`([IO.DirectoryInfo]::new(${literal(home)})).GetAccessControl().AreAccessRulesProtected`), 'True')
  marker(home)
  passed.push('fresh private HOME')
  const existing = snapshot(home)
  privateWindowsRunHome(home)
  assert.deepEqual(snapshot(home), existing, 'A valid existing HOME must retain content and ACLs')
  passed.push('valid existing HOME unchanged')

  const effective = join(base, "everyone-effective-'中文")
  privateWindowsRunHome(effective)
  addEveryone(effective, false)
  marker(effective)
  rejectedUnchanged(effective, 'Everyone effective Allow')

  const descendants = join(base, "everyone-inherit-only-'中文")
  privateWindowsRunHome(descendants)
  addEveryone(descendants, true)
  marker(descendants)
  assert.ok(aclOf(join(descendants, markerName)).includes('WD'), 'The marker must really inherit Everyone access')
  rejectedUnchanged(descendants, 'Everyone InheritOnly Allow')

  const target = join(base, "junction-target-'中文")
  const junction = join(base, "junction-home-'中文")
  privateWindowsRunHome(target)
  marker(target)
  symlinkSync(target, junction, 'junction')
  assert.ok(lstatSync(junction).isSymbolicLink(), 'The fixture must create a real junction')
  const junctionTarget = readlinkSync(junction)
  const targetBefore = snapshot(target)
  rejectedUnchanged(junction, 'junction HOME')
  assert.equal(readlinkSync(junction), junctionTarget)
  assert.deepEqual(snapshot(target), targetBefore, 'Rejecting a junction must not change its target')

  console.log(JSON.stringify({ platform: process.platform, node: process.version, powershell: version, passed, contentAndAclsPreserved: true }))
} finally {
  rmSync(base, { recursive: true, force: true, maxRetries: 3 })
}
