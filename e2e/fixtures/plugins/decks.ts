// Test decks of the classroom, content, code and editor plugins (e2e/fixtures/plugins): built with
// the real CLI in a directory under e2e/fixtures/regression/.presmium, where the deck finds the workspace's
// packages, served on a free port, with a real classroom server when a test needs one.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { presmium } from '../deck.ts'

export { serve } from '../deck.ts'

/** This directory: the fixture pages and plugins. */
export const FIXTURES = resolve('e2e/fixtures/plugins')

/** `presmium-classroom-server --port 0`, archiving to `deck` when given, until it prints its URL. */
export async function startClassroomServer(deck?: string): Promise<{ url: string, child: ChildProcess }> {
  const args = ['--port', '0', '--host', '127.0.0.1', ...deck ? ['--deck', deck] : []]
  const child = spawn(process.execPath, [resolve('packages/classroom-server/bin/server.mjs'), ...args], { stdio: ['ignore', 'pipe', 'inherit'] })
  const url = await new Promise<string>((done, fail) => {
    let output = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const match = /^classroom server {2}(ws:\S+)$/m.exec(output)
      if (match) done(match[1]!)
    })
    child.once('exit', code => fail(new Error(`classroom server exited (${code}): ${output}`)))
  })
  return { url, child }
}

/** A classroom client of another implementation or version, as the classroom server sees it. */
export interface RawLearner {
  /** Writes an entry of the classroom store, as it is. */
  write(collection: string, id: string, value: unknown): void
  close(): void
}

/**
 * A learner's y-websocket client in Node, outside any deck: it proves participant `participant`
 * and writes what it is told to. Yjs and y-websocket come from the classroom server's package.
 */
export async function rawLearner(server: string, room: string, participant: string): Promise<RawLearner> {
  const require = createRequire(resolve('packages/classroom-server/package.json'))
  const { Doc } = require('yjs') as { Doc: new () => { getMap(name: string): { set(key: string, value: unknown): void } } }
  const { WebsocketProvider } = require('y-websocket') as { WebsocketProvider: new (...args: unknown[]) => { once(event: string, listener: () => void): void, destroy(): void } }
  const doc = new Doc()
  const provider = new WebsocketProvider(server, room, doc, { WebSocketPolyfill: require('ws'), disableBc: true, params: { participant, key: `${participant}-key` } })
  await new Promise<void>(done => provider.once('sync', () => done()))
  return {
    write: (collection, id, value) => doc.getMap(`store:${collection}`).set(id, value),
    close: () => provider.destroy(),
  }
}

/**
 * A new deck directory: `lecture.md` with `headmatter` and a title, including
 * the fixture pages `pages` (copied, with `{{deck}}` replaced by the deck's
 * path relative to the workspace root, where code anchors start, and as
 * `transform` changes them).
 */
export function writeDeck(name: string, headmatter: string, pages: string[], transform?: (text: string) => string): string {
  const work = resolve('e2e/fixtures/regression/.presmium')
  mkdirSync(work, { recursive: true })
  const deck = mkdtempSync(join(work, `e2e-${name}-`))
  writeFileSync(join(deck, '.gitignore'), '*\n')
  for (const page of pages) writePage(deck, page, transform)
  writeFileSync(join(deck, 'lecture.md'), `---
${headmatter.trim()}
---

# Test deck ${name}

${pages.map(page => `\`\`\`{include} pages/${page}\n\`\`\``).join('\n\n')}
`)
  return deck
}

/** Copies a fixture page into the deck's `pages/`, as `transform` changes it. */
export function writePage(deck: string, page: string, transform = (text: string) => text): void {
  const file = join(deck, 'pages', page)
  mkdirSync(dirname(file), { recursive: true })
  const text = readFileSync(join(FIXTURES, page), 'utf8').replaceAll('{{deck}}', deck.slice(resolve('.').length + 1).split(sep).join('/'))
  writeFileSync(file, transform(text))
}

/** `presmium build --to <forms>` in the deck; fails with the CLI's output. */
export async function build(deck: string, forms = 'web'): Promise<void> {
  await presmium(['build', '--to', forms], deck)
}
