/**
 * The resolution pass of `{code-ref}` (docs/ir.md section 4, step 6): reads
 * the referenced code from the working tree or a pinned commit, converts the
 * logical units into line highlights (P-15), reads every version (P-16),
 * links the code to its remote repository (P-13) and reports anchors that
 * moved, need confirmation or are lost, and pinned code that drifted (P-14).
 * `presmium check` and `presmium build` both report these diagnostics.
 *
 * Everything the renderers show about the code is in the code node: its
 * `origin`, whether pinned code drifted (`origin.drift`), and the lines and
 * permalink of each version (`variants[k]`). The repository URL of the
 * permalinks is `:repo:`, else `presmium.code.repo` of the block's section
 * (its `{config}` over the headmatter), else the `origin` remote.
 *
 * The working tree is read with the compiler's reader (`PassContext.src`);
 * commits with this addon's, which also reads submodules (P-12). An anchor
 * never names a file in `.git`.
 */
import { existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { docBlocks, errorMessage, isRenderable } from '@presmium/kernel'
import type { AnchorString, CodeNode, CodeVariant, IRDocument, IRPass, PassContext, ResolutionStatus, ResolvedLocation, Severity, SourceReader } from '@presmium/kernel'
import { codeConfig, driftDiff, highlightSteps, permalink, repoWebUrl, splitTarget, toSnippet, unitRecord } from '../domain/index.ts'
import type { CodeRefSpec } from '../domain/index.ts'
import { codeRefs } from './directive.ts'
import { openWorkspace } from './git.ts'
import type { Repository, Workspace } from './git.ts'

const LOCK_HINT = 'run presmium check --update-lock to record the current location'

/** The code shown for one revision: a pinned commit or version, or the working tree. */
interface Shot {
  commit?: string
  location: ResolvedLocation
  fingerprint?: string
  status: ResolutionStatus
}

type Report = (checkId: string, severity: Severity, message: string, hint?: string) => void

export const codeRefPass: IRPass = {
  name: 'presmium.code.resolve',
  async run(doc, ctx) {
    const own = openWorkspace(ctx.workspaceRoot)
    const workspace: Workspace = { ...own, src: { read: (file, ref) => (ref === undefined ? ctx.src.read(file) : own.src.read(file, ref)) } }
    for (const { section, block } of docBlocks(doc)) {
      const spec = block.node.type === 'code' ? codeRefs.get(block.node) : undefined
      if (!spec) continue
      const report: Report = (checkId, severity, message, hint) =>
        ctx.report({ checkId, severity, message, source: { file: block.source.file, line: block.source.line }, ...hint ? { hint } : {} })
      await resolve(block.node as CodeNode, spec, codeConfig(ctx.configFor(section)).repo, workspace, ctx, report)
    }
  },
}

/** Anchors of the code references in a compiled deck, for `presmium check --update-lock`. */
export function codeRefAnchors(doc: IRDocument | undefined): AnchorString[] {
  if (!doc) return []
  return [...docBlocks(doc)].flatMap(({ block: { node } }) => node.type === 'code' && node.origin?.anchor ? [node.origin.anchor] : [])
}

/**
 * Why an anchor is lost. When its file is missing from the working tree, the
 * message says that anchor paths start at the repository root and, when the
 * path names a file from the deck's directory instead, how to write it.
 */
async function lostMessage(anchor: AnchorString, message: string | undefined, workspace: Workspace, ctx: PassContext): Promise<[string, string]> {
  const file = splitTarget(anchor)?.file
  const restore = 'restore the #region markers, the declaration or the code the pattern matches, or fix the anchor'
  if (file === undefined || await workspace.src.read(file) !== undefined) return [`anchor ${anchor} is lost: ${message}`, restore]
  const root = relative(ctx.deckDir, ctx.workspaceRoot).split(sep).join('/') || '.'
  const fromDeck = relative(ctx.workspaceRoot, join(ctx.deckDir, file)).split(sep).join('/')
  const hint = existsSync(join(ctx.deckDir, file)) && !fromDeck.startsWith('..')
    ? `${file} is a file of the deck's directory; from the repository root it is ${fromDeck}: write ${anchor.replace(file, fromDeck)}`
    : 'write the path of the file from the repository root'
  return [`anchor ${anchor} is lost: ${file} not found under the repository root (${root}); anchor paths are relative to the repository root`, hint]
}

async function resolve(node: CodeNode, spec: CodeRefSpec, configuredRepo: string | undefined, workspace: Workspace, ctx: PassContext, report: Report): Promise<void> {
  const { anchor } = spec
  const fail = (message: string, hint?: string) => report('presmium.code.anchors', 'error', message, hint)
  if (splitTarget(anchor)?.file.split(/[\\/]/).includes('.git')) {
    fail(`anchor ${anchor} names a file in .git, which holds git's data, not code`, 'point the anchor at a file of the working tree')
    node.origin!.status = 'lost'
    return
  }

  // Anchor health in the working tree, against the lock.
  const recorded = ctx.lock.anchors[anchor]
  const current = await ctx.resolvers.resolve(anchor, workspace.src, recorded)
  const where = current.location && `${current.location.file}:${current.location.startLine}`
  if (current.status === 'lost') fail(...await lostMessage(anchor, current.message, workspace, ctx))
  if (current.status === 'fuzzy') {
    report('presmium.code.anchors', 'warning', `anchor ${anchor} needs confirmation: ${current.message}`, `point the anchor at the right candidate, then ${LOCK_HINT}`)
  }
  if (current.status === 'moved') report('presmium.code.anchors', 'info', `anchor ${anchor} moved to ${where}`, LOCK_HINT)
  if (current.status === 'exact' && recorded && recorded.fingerprint !== current.fingerprint) {
    report('presmium.code.anchors', 'info', `code at ${anchor} changed since the anchor was locked`, LOCK_HINT)
  }

  // Commits are read with this addon's reader, which also reads submodules (P-12).
  const repo = await workspace.repository(splitTarget(anchor)?.file ?? '')
  const shots: Shot[] = []
  for (const rev of spec.variants ?? [spec.pin]) {
    if (rev === undefined) {
      if (isRenderable(current)) shots.push({ location: current.location!, fingerprint: current.fingerprint, status: current.status })
      continue
    }
    const commit = await repo.commit(rev)
    if (!commit) {
      fail(`commit "${rev}" of ${anchor} not found`, 'use a commit of the repository that holds the file')
      continue
    }
    const resolution = await ctx.resolvers.resolve(anchor, workspace.src, undefined, commit)
    if (!isRenderable(resolution)) fail(`anchor ${anchor} cannot be read at ${rev}: ${resolution.message}`)
    else shots.push({ commit, location: resolution.location!, fingerprint: resolution.fingerprint, status: resolution.status })
  }

  const url = await repoUrl(repo, spec.repo ?? configuredRepo)
  if (!url) report('presmium.code.links', 'info', `no remote repository for ${anchor}; it is shown without a permalink`, 'set presmium.code.repo in the headmatter or :repo: on the directive, or add an origin remote')
  const link = (shot: Shot | undefined) => url && shot?.commit ? permalink(url, shot.commit, repo.path(shot.location.file), shot.location.startLine, shot.location.endLine) : undefined

  const shown = shots.at(-1)
  if (!shown || shots.length < (spec.variants?.length ?? 1)) {
    if (current.location) Object.assign(node.origin!, { file: current.location.file, startLine: current.location.startLine, endLine: current.location.endLine })
    node.origin!.status = current.status
    return
  }

  const snippet = toSnippet(shown.location.text)
  const { file, startLine, endLine } = shown.location
  // Code of the working tree links to HEAD, where its lines may differ.
  const linked = shown.commit ? shown : await head(anchor, repo, workspace, ctx)
  node.value = snippet.code
  node.origin = { anchor, file, startLine, endLine, status: shown.status, units: unitRecord(snippet.units) }
  const origin = node.origin
  if (shown.commit) origin.pin = shown.commit
  const href = link(linked)
  if (href) origin.permalink = href

  if (spec.variants) {
    // Each version with its own lines and link (C-10), shown with it on its step.
    node.variants = shots.map((shot): CodeVariant => {
      const variant: CodeVariant = { label: shot.commit!.slice(0, 7), value: toSnippet(shot.location.text).code, startLine: shot.location.startLine, endLine: shot.location.endLine }
      const href = link(shot)
      if (href) variant.permalink = href
      return variant
    })
    return
  }
  if (spec.steps) {
    try {
      node.highlight = highlightSteps(spec.steps, snippet.units)
    }
    catch (error) {
      report('presmium.code.anchors', 'error', errorMessage(error), 'add nested #region markers for each step')
    }
  }
  if (shown.commit) {
    origin.drift = isRenderable(current) && current.fingerprint === shown.fingerprint ? 'synced' : 'drifted'
    if (isRenderable(current) && origin.drift === 'drifted') {
      const diff = driftDiff(file, { commit: shown.commit, text: shown.location.text }, { label: 'working-tree', text: current.location!.text })
      report('presmium.code.drift', 'warning', `code at ${anchor} drifted since pinned commit ${spec.pin}`, `review the change, then update the code or the pin:\n${diff}`)
    }
  }
}

/** The anchor at HEAD, for the permalink of code read from the working tree. */
async function head(anchor: AnchorString, repo: Repository, workspace: Workspace, ctx: PassContext): Promise<Shot | undefined> {
  const commit = await repo.commit('HEAD')
  if (!commit) return undefined
  const resolution = await ctx.resolvers.resolve(anchor, workspace.src, undefined, commit)
  return isRenderable(resolution) ? { commit, location: resolution.location!, status: resolution.status } : undefined
}

/**
 * Web URL of a repository for permalinks: for the workspace's own repository
 * the configured URL when set, otherwise the `origin` remote.
 */
async function repoUrl(repo: Repository, configured: string | undefined): Promise<string | undefined> {
  return repoWebUrl((repo.prefix ? undefined : configured) ?? await repo.remote())
}
