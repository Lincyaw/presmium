const GIT_SAFE_CONFIG: readonly string[] = ['core.hooksPath=/dev/null', 'core.fsmonitor=false', 'core.quotePath=false', 'commit.gpgSign=false', 'tag.gpgSign=false']

export function gitConfigArgs(): string[] {
  return GIT_SAFE_CONFIG.flatMap(entry => ['-c', entry])
}

export function gitEnvironment(env: Record<string, string | undefined>): Record<string, string> {
  const own: Record<string, string> = {}
  for (const [name, value] of Object.entries(env)) if (value !== undefined && !/^GIT_/i.test(name)) own[name] = value
  own.GIT_TERMINAL_PROMPT = '0'
  return own
}
