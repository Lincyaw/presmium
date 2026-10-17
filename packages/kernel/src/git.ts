/**
 * How Presmium runs git (docs/architecture.md 4.8, 10.7, section 11), as data
 * for the workspace's history and the assistant's git review: every command
 * with the repository's hooks and fsmonitor off and without signing, paths
 * written as they are; in SHARED mode (`isolated`) git reads nothing the
 * sandbox could have written and no configuration but the repository's own:
 * no system or global configuration, no attributes but the repository's
 * `info/attributes` (those of the work tree are read from the empty tree),
 * nothing done in submodules, the git directory and work tree as the caller
 * found them, and no inherited `GIT_*` variable.
 */

/** The configuration (`-c`) every git command runs with. */
export const GIT_SAFE_CONFIG: readonly string[] = ['core.hooksPath=/dev/null', 'core.fsmonitor=false', 'core.quotePath=false', 'commit.gpgSign=false', 'tag.gpgSign=false']

/** Further configuration in SHARED mode: no global attributes, nothing done in submodules. */
export const GIT_ISOLATED_CONFIG: readonly string[] = ['core.attributesFile=/dev/null', 'submodule.recurse=false', 'diff.ignoreSubmodules=all']

/** The empty tree, whence SHARED mode reads the work tree's attributes, that is, none (`GIT_ATTR_SOURCE`). */
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/** The oldest git SHARED mode runs with: 2.42 honors `GIT_ATTR_SOURCE` (and 2.40 has `merge-tree --write-tree --merge-base`). */
export const ISOLATED_GIT_MIN: readonly [major: number, minor: number] = [2, 42]

/** The `-c` arguments of a git command: the safe configuration, and the isolated one in SHARED mode. */
export function gitConfigArgs(isolated: boolean): string[] {
  return [...GIT_SAFE_CONFIG, ...isolated ? GIT_ISOLATED_CONFIG : []].flatMap(entry => ['-c', entry])
}

/**
 * The environment of a git command: `env` (the process's) without its `GIT_*`
 * variables and with prompts off; in SHARED mode (`gitIsolatedEnv`) without
 * system or global configuration and the work tree's attributes.
 */
export function gitEnvironment(env: Record<string, string | undefined>, isolated: boolean, dirs?: { gitDir: string, top: string }): Record<string, string> {
  const own: Record<string, string> = {}
  for (const [name, value] of Object.entries(env)) if (value !== undefined && !/^GIT_/i.test(name)) own[name] = value
  own.GIT_TERMINAL_PROMPT = '0'
  return isolated ? { ...own, ...gitIsolatedEnv(dirs) } : own
}

/** The variables of SHARED mode's isolation; with `dirs`, the git directory and work tree fixed as found (a planted `.git` is never discovered). */
export function gitIsolatedEnv(dirs?: { gitDir: string, top: string }): Record<string, string> {
  return {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_ATTR_SOURCE: EMPTY_TREE,
    ...dirs ? { GIT_DIR: dirs.gitDir, GIT_WORK_TREE: dirs.top } : {},
  }
}

/** Why the git of `git version`'s output cannot run SHARED mode; undefined when it can. */
export function isolatedGitProblem(versionOutput: string): string | undefined {
  const version = /(\d+)\.(\d+)/.exec(versionOutput)
  const [major, minor] = version ? [Number(version[1]), Number(version[2])] : [0, 0]
  const [needMajor, needMinor] = ISOLATED_GIT_MIN
  if (major > needMajor || (major === needMajor && minor >= needMinor)) return undefined
  return `SHARED mode needs git ${ISOLATED_GIT_MIN.join('.')} or later (GIT_ATTR_SOURCE, merge-tree --merge-base); this is ${version?.[0] ?? 'unknown'}`
}
