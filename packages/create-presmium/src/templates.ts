/**
 * The templates a new project is made from (P-142), each with one source in the Presmium
 * repository. A package's tarball holds only files inside its own directory, so packing copies
 * every source into this package's `templates/` (`prepack`: scripts/templates.ts), where nothing
 * is kept in git; test/create.test.ts checks that the tarball holds each source, file for file.
 * npm leaves `.gitignore` files out of tarballs: one is stored as `gitignore`, and a new project
 * gets it back as `.gitignore`.
 */
import { readdirSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Each template's directory in `templates/`, and its source, from the repository's root. */
export const TEMPLATE_SOURCES: Record<string, string> = {
  // The document templates of `presmium serve`, published with @presmium/workspace.
  'document': 'packages/workspace/templates/document',
  'workspace': 'templates/workspace',
  'plugin': 'templates/plugin',
  // The skills a project's agents get (AGENTS.md).
  'skills/presmium-author': '.agents/skills/presmium-author',
  'skills/presmium-develop': '.agents/skills/presmium-develop',
  'skills/presmium-present': '.agents/skills/presmium-present',
}

/** This package's `templates/`. */
export const TEMPLATES = fileURLToPath(new URL('../templates', import.meta.url))

/** What a source holds that is not the template: what installing, building or previewing it leaves. */
const LEFT_OUT = new Set(['node_modules', 'dist', '.presmium'])

/** The files under `dir`, relative to it, but those `LEFT_OUT`. */
export function templateFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)))
    .filter(path => !path.split(/[\\/]/).some(part => LEFT_OUT.has(part)))
    .sort()
}

/** A source file's path in `templates/`: a `.gitignore` is a `gitignore`. */
export function storedPath(path: string): string {
  return basename(path) === '.gitignore' ? join(dirname(path), 'gitignore') : path
}

/** A stored file's path in a new project: a `gitignore` is a `.gitignore` again. */
export function projectPath(path: string): string {
  return basename(path) === 'gitignore' ? join(dirname(path), '.gitignore') : path
}
