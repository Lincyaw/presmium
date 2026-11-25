import { execFileSync } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { join } from 'node:path'

/** Windows mode bits do not describe access: create with a private DACL and check existing ACLs. */
export function privateWindowsRunHome(home: string): void {
  let before: ReturnType<typeof lstatSync> | undefined
  try { before = lstatSync(home) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  if (before && (!before.isDirectory() || before.isSymbolicLink())) throw new Error(`the run HOME ${home} is not a private directory of this user`)
  const script = `
$ErrorActionPreference = 'Stop'
$path = '${home.replaceAll("'", "''")}'
$user = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetOwner($user)
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule($user, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.AddAccessRule($rule)
[IO.Directory]::CreateDirectory($path, $acl) | Out-Null
$item = [IO.DirectoryInfo]::new($path)
if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'The run HOME is a reparse point' }
$actual = $item.GetAccessControl()
$allowed = @($user.Value, 'S-1-5-18', 'S-1-5-32-544')
if ($actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $allowed) { throw 'The run HOME has another owner' }
$full = $false
foreach ($entry in $actual.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
  if ($entry.AccessControlType -ne 'Allow' -or $entry.IdentityReference.Value -notin $allowed) { throw 'The run HOME permits another account' }
  if (($entry.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0) { continue }
  if ($entry.IdentityReference.Value -eq $user.Value -and ($entry.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl) { $full = $true }
}
if (-not $full) { throw 'The run HOME is not writable by this user' }
`
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  try {
    execFileSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (cause) { throw new Error(`the run HOME ${home} is not a private directory of this user`, { cause }) }
  const after = lstatSync(home)
  if (!after.isDirectory() || after.isSymbolicLink()) throw new Error(`the run HOME ${home} is not a private directory of this user`)
}
