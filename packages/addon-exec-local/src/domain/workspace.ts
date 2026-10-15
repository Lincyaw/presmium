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
    throw new Error(`路径必须位于工作区内：${file}`)
  }
  return parts.join('/')
}

/** `presmium/edit-20261015-043720` (UTC). */
export function defaultBranch(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  return `presmium/edit-${stamp}`
}

export function defaultCommitMessage(file: string): string {
  return `presmium: 演示中修改 ${file}`
}

/** File name of the exported environment: `presmium-env-greet.zip` for `src/greet.py`. */
export function archiveName(file: string): string {
  const name = file.split('/').pop() ?? file
  return `presmium-env-${name.replace(/\.[^.]*$/, '') || 'snippet'}.zip`
}

/** README of the exported environment (P-26). */
export function replicateReadme(file: string, runner?: string[]): string {
  const run = runner ? `${runner[0]} ${file}` : `<运行 ${file} 的命令>`
  return [
    '# Presmium 导出的运行环境',
    '',
    `本压缩包包含演示中的代码片段 \`${file}\` 与仓库的 devcontainer 定义。`,
    '',
    '用 Dev Containers CLI 打开并运行：',
    '',
    '```sh',
    'devcontainer up --workspace-folder .',
    `devcontainer exec --workspace-folder . ${run}`,
    '```',
    '',
    '也可以在 VS Code 中打开本目录，选择“Reopen in Container”。',
    '',
  ].join('\n')
}
