import { isRecord, languageId } from '@presmium/kernel'

/**
 * Language id (`languageId` of @presmium/kernel) -> command that receives the
 * code as its last argument. A Python command runs Presmium's runner in
 * place of the code, which gives the request's parameters as variables.
 */
export type Runners = Record<string, string[]>

/** Used unless the devcontainer definition sets `customizations.presmium.runners`. */
export const DEFAULT_RUNNERS: Runners = { python: ['python3', '-c'] }

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

/** File name of the exported environment: `presmium-env-greet.zip` for `src/greet.py`. */
export function archiveName(file: string): string {
  const name = file.split('/').pop() ?? file
  return `presmium-env-${name.replace(/\.[^.]*$/, '') || 'snippet'}.zip`
}
