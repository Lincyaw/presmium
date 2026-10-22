import { isRecord, languageId } from '@lincyaw/kernel'

/** The command that runs code of each language in the container; the code follows as its last argument. */
export type LanguageCommands = Record<string, string[]>

export const DEFAULT_LANGUAGE_COMMANDS: LanguageCommands = { python: ['python3', '-c'] }

/** The commands of the devcontainer definition (`customizations.presmium.runners`) over the default ones. */
export function languageCommandsFrom(customizations: unknown): LanguageCommands {
  const presmium = isRecord(customizations) ? customizations.presmium : undefined
  const custom = isRecord(presmium) && isRecord(presmium.runners) ? presmium.runners : {}
  const commands: LanguageCommands = { ...DEFAULT_LANGUAGE_COMMANDS }
  for (const [lang, command] of Object.entries(custom)) {
    if (Array.isArray(command) && command.length > 0 && command.every(part => typeof part === 'string')) {
      commands[languageId(lang)] = command
    }
  }
  return commands
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
