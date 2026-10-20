import { isRecord, languageId } from '@lincyaw/kernel'

export type Runners = Record<string, string[]>

export const DEFAULT_RUNNERS: Runners = { python: ['python3', '-c'] }

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

export function workspacePath(file: string): string {
  const parts = file.replaceAll('\\', '/').split('/').filter(part => part !== '' && part !== '.')
  if (!file || /^([a-z]:)?[\\/]/i.test(file) || parts.length === 0 || parts.includes('..') || parts[0] === '.git') {
    throw new Error(`not a path inside the workspace: ${file}`)
  }
  return parts.join('/')
}

export function archiveName(file: string): string {
  const name = file.split('/').pop() ?? file
  return `presmium-env-${name.replace(/\.[^.]*$/, '') || 'snippet'}.zip`
}
