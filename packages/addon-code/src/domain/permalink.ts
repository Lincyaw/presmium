const SCP = /^[\w.-]+@([^:/]+):(.+)$/
const URL_LIKE = /^(https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/

/**
 * Web URL of a repository from a git remote or a configured URL:
 * `git@host:owner/repo.git`, `ssh://git@host/owner/repo.git` and
 * `https://host/owner/repo(.git)` all become `https://host/owner/repo`.
 */
export function repoWebUrl(remote: string | undefined): string | undefined {
  const url = remote?.trim() ?? ''
  const scp = SCP.exec(url)
  const full = URL_LIKE.exec(url)
  const [scheme, host, path] = scp ? ['https', scp[1], scp[2]] : full ? [full[1] === 'http' ? 'http' : 'https', full[2], full[3]] : []
  if (!host || !path) return undefined
  return `${scheme}://${host}/${path.replace(/\/+$/, '').replace(/\.git$/, '')}`
}

/**
 * Link to lines `start..end` of `file` at `commit` (P-13). GitLab uses its own
 * path and line syntax; other hosts use GitHub's, which Gitea and Forgejo share.
 */
export function permalink(repo: string, commit: string, file: string, start: number, end: number): string {
  const path = file.split('/').map(encodeURIComponent).join('/')
  if (/gitlab/i.test(repo)) return `${repo}/-/blob/${commit}/${path}#L${start}${end > start ? `-${end}` : ''}`
  return `${repo}/blob/${commit}/${path}#L${start}${end > start ? `-L${end}` : ''}`
}
