import { realpathSync } from 'node:fs'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { DECK_ENTRY, pluginLogger } from '@presmium/compiler'
import { DOCUMENT_FILES, DOCUMENT_LOCKS, REVISIONS } from '@presmium/kernel'
import type { ChangeReviewService, DocumentLockService, ServiceToken } from '@presmium/kernel'
import type { ServedPlugin } from '@presmium/server'
import { WORKSPACE_ID } from '../domain/api.ts'
import type { WorkspaceConfig } from './config.ts'
import { Documents } from './documents.ts'
import { localWriter } from './files.ts'
import { Git } from './git.ts'
import { DocumentLocks } from './locks.ts'
import { GIT_REVIEW, Reviews } from './review/reviews.ts'
import { Revisions } from './revisions.ts'
import { workspacePlugin } from './routes.ts'
import { servedPlugins } from './site.ts'

export interface DeckEditing {
  plugin: ServedPlugin
  services: [ServiceToken<unknown>, unknown][]
  sitePlugins: Record<string, string>
  root: string
  git: boolean
  tokenIgnored: boolean
}

export function deckEditing(entry: string): DeckEditing {
  const given = resolve(dirname(entry))
  const deckDir = realpathSync(given)
  const repository = Git.isRepository(deckDir)
  const committed = repository && !Git.ignores(deckDir, basename(entry))
  const shared = !repository || (committed && given === deckDir)
  const root = committed ? new Git(deckDir).top : deckDir
  const git = committed ? new Git(root) : undefined
  const document = relative(root, deckDir).split(sep).join('/')
  const config: WorkspaceConfig = {
    root,
    title: basename(deckDir),
    documents: [document ? `${document}/${DECK_ENTRY}` : DECK_ENTRY],
    single: document === '',
    site: {},
    approvals: {},
    settings: {},
  }
  const writer = localWriter(config)
  const locks = new DocumentLocks()
  const deckLocks: DocumentLockService = {
    claim: (dir, holder) => locks.claim(dir || document, holder),
    holder: dir => locks.holder(dir || document),
  }
  const revisions = git ? new Revisions(git, { config, writer }) : undefined
  const documents = new Documents({ config, git: git!, revisions: revisions!, writer, locks })
  const plugin = workspacePlugin({ documents, ...revisions ? { revisions } : {}, locks, document })
  const reviews = revisions ? new Reviews({ config, revisions, locks, ...shared ? { files: writer } : {}, log: pluginLogger('presmium dev') }) : undefined
  if (reviews) void reviews.recover([document], { resume: false })
  const gitReview: ChangeReviewService | undefined = reviews && { engine: reviews.service.engine, open: options => reviews.service.open({ ...options, document: options.document || document }) }
  return {
    plugin: { id: WORKSPACE_ID, plugin, config: {} },
    services: [
      ...revisions ? [[REVISIONS, revisions] as [ServiceToken<unknown>, unknown]] : [],
      ...gitReview ? [[GIT_REVIEW, gitReview] as [ServiceToken<unknown>, unknown]] : [],
      ...shared ? [[DOCUMENT_FILES, writer] as [ServiceToken<unknown>, unknown]] : [],
      [DOCUMENT_LOCKS, deckLocks],
    ],
    sitePlugins: servedPlugins(),
    root,
    git: committed,
    tokenIgnored: !committed || Git.ignores(deckDir, '.presmium/server.json'),
  }
}
