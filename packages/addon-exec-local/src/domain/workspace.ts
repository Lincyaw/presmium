/** Language id -> command that receives the code as its last argument. */
export type Runners = Record<string, string[]>

/** Used unless the devcontainer definition sets `customizations.presmium.runners`. */
export const DEFAULT_RUNNERS: Runners = { python: ['python3', '-c'] }

export function languageId(lang: string): string {
  const id = lang.trim().toLowerCase()
  return id === 'py' ? 'python' : id
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** The runners of a devcontainer definition's `customizations`, over the defaults. */
export function runnersFrom(customizations: unknown): Runners {
  const presmium = isRecord(customizations) ? customizations.presmium : undefined
  const custom = isRecord(presmium) && isRecord(presmium.runners) ? presmium.runners : {}
  const runners: Runners = { ...DEFAULT_RUNNERS }
  for (const [lang, command] of Object.entries(custom)) {
    if (Array.isArray(command) && command.length > 0 && command.every(part => typeof part === 'string')) {
      runners[languageId(lang)] = command
    }
  }
  return runners
}

/**
 * A workspace-relative path with forward slashes. Throws for absolute paths and
 * paths that leave the workspace, so requests cannot reach other files.
 */
export function workspacePath(file: string): string {
  const parts = file.replaceAll('\\', '/').split('/').filter(part => part !== '' && part !== '.')
  if (!file || /^([a-z]:)?[\\/]/i.test(file) || parts.length === 0 || parts.includes('..') || parts[0] === '.git') {
    throw new Error(`not a path inside the workspace: ${file}`)
  }
  return parts.join('/')
}

/** `presmium/edit-20261015-043720` (UTC). */
export function defaultBranch(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  return `presmium/edit-${stamp}`
}

/** File name of the exported environment: `presmium-env-greet.zip` for `src/greet.py`. */
export function archiveName(file: string): string {
  const name = file.split('/').pop() ?? file
  return `presmium-env-${name.replace(/\.[^.]*$/, '') || 'snippet'}.zip`
}
