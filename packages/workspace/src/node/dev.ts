/**
 * The source editor in `presmium dev` (P-124, docs/architecture.md 10.1): the
 * deck is the page's one document, as a document of `presmium serve` is. The
 * workspace's routes (`files`, `source`, `changes` and the history), the
 * document writer (`DOCUMENT_FILES`), the document's lock (`DOCUMENT_LOCKS`)
 * and, where its changes are committed, the history (`REVISIONS`) are those
 * of serve, over a workspace of this one deck; the web form's dev server
 * loads the workspace's browser plugin (edit mode).
 *
 * The workspace root is the root the compiler finds for the deck: the top of
 * its git work tree, else the deck directory, so a path of `DOCUMENT_FILES`
 * names the same file for the deck's plugins and for the writer. A deck in
 * no git repository, or one git ignores, saves but commits nothing: no
 * `REVISIONS`, and the history is empty. Inside a repository that ignores
 * it, the editor's root is the deck directory, which is not the compiler's
 * workspace root: there the plugins write their files themselves, as
 * without the workspace (no `DOCUMENT_FILES`), and so they do when the deck
 * directory was given through a symbolic link inside a repository. Where
 * the changes are committed, the assistant's change tasks are reviewed with
 * the workspace's git review (`GIT_REVIEW`, ./review/reviews.ts).
 *
 * What is generated in the deck's `.presmium/` (the MCP token of
 * `presmium dev`, `.presmium/server.json`, among it) the editor neither
 * lists nor commits, whatever the repository's `.gitignore` says
 * (`generatedPath`, ./files.ts).
 */
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
  /** The workspace's routes, as a plugin of the deck's served document. */
  plugin: ServedPlugin
  /** The Node services of the deck's compilation, so its plugins write, lock and commit as the editor does. */
  services: [ServiceToken<unknown>, unknown][]
  /** The web form's own plugins (package name to directory): the workspace's browser plugin. */
  sitePlugins: Record<string, string>
  /** The workspace root of the editor's paths. */
  root: string
  /** Whether the editor's changes are committed: the deck is in a git work tree that does not ignore it. */
  git: boolean
  /** Whether git ignores the deck's `.presmium/server.json` (the MCP token), or nothing there is committed: `git add` takes it otherwise. */
  tokenIgnored: boolean
}

/** Edit mode for the deck of `entry` in `presmium dev`. */
export function deckEditing(entry: string): DeckEditing {
  const given = resolve(dirname(entry))
  const deckDir = realpathSync(given)
  const repository = Git.isRepository(deckDir)
  const committed = repository && !Git.ignores(deckDir, basename(entry))
  // The plugins name a file relative to the compiler's workspace root from the deck directory as given: in a
  // repository (whose top git gives as a real path), the same file only where that is the real path.
  const shared = !repository || (committed && given === deckDir)
  const root = committed ? new Git(deckDir).top : deckDir
  const git = committed ? new Git(root) : undefined
  const document = relative(root, deckDir).split(sep).join('/')
  // A workspace of the one deck, whatever its entry is called: its directory is the one document directory.
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
  // The deck's plugins name it as the server does ('', its document); the editor's routes by its directory.
  const deckLocks: DocumentLockService = {
    claim: (dir, holder) => locks.claim(dir || document, holder),
    holder: dir => locks.holder(dir || document),
  }
  const revisions = git ? new Revisions(git, { config, writer }) : undefined
  const documents = new Documents({ config, git: git!, revisions: revisions!, writer, locks })
  const plugin = workspacePlugin({ documents, ...revisions ? { revisions } : {}, locks, document })
  // The git review for the assistant's change tasks (`GIT_REVIEW`; the deck is its document ''), and a
  // crashed process's task rolled back now. A session's review that serve left waits for serve.
  const reviews = revisions ? new Reviews({ config, revisions, locks, ...shared ? { files: writer } : {}, log: pluginLogger('presmium dev') }) : undefined
  if (reviews) void reviews.recover([document], { resume: false })
  const gitReview: ChangeReviewService | undefined = reviews && { engine: reviews.service.engine, open: options => reviews.service.open({ ...options, document: options.document || document }) }
  return {
    plugin: { id: WORKSPACE_ID, plugin, config: {} },
    services: [
      ...revisions ? [[REVISIONS, revisions] as [ServiceToken<unknown>, unknown]] : [],
      ...gitReview ? [[GIT_REVIEW, gitReview] as [ServiceToken<unknown>, unknown]] : [],
      // Only where the editor's root is the compiler's workspace root (see above).
      ...shared ? [[DOCUMENT_FILES, writer] as [ServiceToken<unknown>, unknown]] : [],
      [DOCUMENT_LOCKS, deckLocks],
    ],
    sitePlugins: servedPlugins(),
    root,
    git: committed,
    tokenIgnored: !committed || Git.ignores(deckDir, '.presmium/server.json'),
  }
}
