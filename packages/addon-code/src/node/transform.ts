import { createAnchorResolverRegistry, isRenderable } from '@presmium/kernel'
import type { AnchorString, MarkdownTransformInput, PresentationMode, ResolvedLocation } from '@presmium/kernel'
import {
  codeConfig,
  findCodeRefBlocks,
  highlightSteps,
  lineRange,
  parseCodeRef,
  permalink,
  regionResolver,
  renderCodeRef,
  repoWebUrl,
  toSnippet,
} from '../domain/index.ts'
import type { CodeRefSpec, CodeRefView, CodeVersion } from '../domain/index.ts'
import { openWorkspace } from './git.ts'
import type { Workspace } from './git.ts'
import { symbolResolver } from './symbol.ts'

/** Resolvers of the anchor schemes code references accept. */
export const codeResolvers = createAnchorResolverRegistry([regionResolver, symbolResolver])

/** Web URL for permalinks: `presmium.code.repo` from the slide or deck, else the `origin` remote. */
export async function repoFor(workspace: Workspace, headmatter: unknown, frontmatter: unknown): Promise<string | undefined> {
  return repoWebUrl(codeConfig(headmatter, frontmatter).repo ?? await workspace.remote())
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface Snapshot {
  /** Full hash; undefined for the working tree. */
  commit?: string
  location: ResolvedLocation
  fingerprint?: string
}

/** The code an anchor names at a revision (the working tree when omitted); throws when it cannot be rendered. */
export async function snapshot(workspace: Workspace, anchor: AnchorString, rev?: string): Promise<Snapshot> {
  const commit = rev === undefined ? undefined : await workspace.commit(rev)
  if (rev !== undefined && !commit) throw new Error(`commit "${rev}" not found`)
  const resolution = await codeResolvers.resolve(anchor, workspace.src, undefined, commit)
  if (!isRenderable(resolution) || !resolution.location) throw new Error(resolution.message ?? `anchor ${anchor} is ${resolution.status}`)
  return { commit, location: resolution.location, fingerprint: resolution.fingerprint }
}

interface Env {
  workspace: Workspace
  repo?: string
}

function link(env: Env, commit: string | undefined, { file, startLine, endLine }: ResolvedLocation): string | undefined {
  return env.repo && commit ? permalink(env.repo, commit, file, startLine, endLine) : undefined
}

async function single(spec: CodeRefSpec, env: Env): Promise<{ view: CodeRefView, versions: CodeVersion[] }> {
  const shown = await snapshot(env.workspace, spec.anchor, spec.pin)
  const snippet = toSnippet(shown.location.text)
  // Unpinned code links to HEAD, where its lines may differ from the working tree.
  const linked = shown.commit ? shown : await snapshot(env.workspace, spec.anchor, 'HEAD').catch(() => undefined)
  const { file, startLine, endLine } = shown.location
  const view: CodeRefView = {
    anchor: spec.anchor,
    file,
    lines: lineRange(startLine, endLine),
    commit: shown.commit,
    pinned: spec.pin !== undefined,
    href: linked && link(env, linked.commit, linked.location),
  }
  if (shown.commit) {
    const current = await codeResolvers.resolve(spec.anchor, env.workspace.src)
    view.drift = isRenderable(current) && current.fingerprint === shown.fingerprint ? 'synced' : 'drifted'
  }
  const highlight = spec.steps && highlightSteps(spec.steps, snippet.units)
  return { view, versions: [{ code: snippet.code, highlight, label: shown.commit?.slice(0, 7) ?? file }] }
}

async function variants(spec: CodeRefSpec, revs: string[], env: Env): Promise<{ view: CodeRefView, versions: CodeVersion[] }> {
  const shots = await Promise.all(revs.map(rev => snapshot(env.workspace, spec.anchor, rev)))
  const view: CodeRefView = {
    anchor: spec.anchor,
    file: shots.at(-1)!.location.file,
    variants: shots.map(s => ({ commit: s.commit!, lines: lineRange(s.location.startLine, s.location.endLine), href: link(env, s.commit, s.location) })),
  }
  const versions = shots.map(s => ({ code: toSnippet(s.location.text).code, label: s.commit!.slice(0, 7) }))
  return { view, versions }
}

function langOf(file: string | undefined): string {
  const ext = /\.([\w-]+)$/.exec(file ?? '')?.[1]
  return ext ?? 'text'
}

async function renderBlock(body: string, env: Env, mode: PresentationMode): Promise<string> {
  let spec: CodeRefSpec | undefined
  try {
    spec = parseCodeRef(body)
    const { view, versions } = spec.variants ? await variants(spec, spec.variants, env) : await single(spec, env)
    return renderCodeRef(view, spec.lang ?? langOf(view.file), versions, mode)
  }
  catch (error) {
    return renderCodeRef({ anchor: spec?.anchor ?? '', error: errorMessage(error) }, '', [], mode)
  }
}

/**
 * Expands ```` ```coderef ```` blocks into `<PmCodeRef>` around standard code
 * blocks, in both forms. A block that cannot be resolved renders an error in
 * place; `presmium check` reports it with its source location.
 */
export async function transformCodeRefs(input: MarkdownTransformInput): Promise<string> {
  const blocks = findCodeRefBlocks(input.content)
  if (blocks.length === 0) return input.content
  const workspace = openWorkspace(input.workspaceRoot)
  const env: Env = { workspace, repo: await repoFor(workspace, input.headmatter, input.frontmatter) }
  let out = ''
  let last = 0
  for (const block of blocks) {
    out += input.content.slice(last, block.start) + await renderBlock(block.body, env, input.mode)
    last = block.end
  }
  return out + input.content.slice(last)
}
