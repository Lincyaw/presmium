/**
 * How Presmium runs git (docs/architecture.md 4.8, 10.7, section 11), as data
 * for the workspace's history and the assistant's git review: every command
 * with the repository's hooks and fsmonitor off and without signing, paths
 * written as they are, and no inherited `GIT_*` variable.
 */

/** The configuration (`-c`) every git command runs with. */
export const GIT_SAFE_CONFIG: readonly string[] = ['core.hooksPath=/dev/null', 'core.fsmonitor=false', 'core.quotePath=false', 'commit.gpgSign=false', 'tag.gpgSign=false']

/** The `-c` arguments of a git command: the safe configuration. */
export function gitConfigArgs(): string[] {
  return GIT_SAFE_CONFIG.flatMap(entry => ['-c', entry])
}

/** The environment of a git command: `env` (the process's) without its `GIT_*` variables and with prompts off. */
export function gitEnvironment(env: Record<string, string | undefined>): Record<string, string> {
  const own: Record<string, string> = {}
  for (const [name, value] of Object.entries(env)) if (value !== undefined && !/^GIT_/i.test(name)) own[name] = value
  own.GIT_TERMINAL_PROMPT = '0'
  return own
}
