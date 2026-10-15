import { watch } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import type { VitePluginsSetup } from '@slidev/types'

interface DevWatcher {
  add(paths: string | string[]): unknown
  emit(event: 'change', path: string): unknown
}

const GIT = `${sep}.git${sep}`

/**
 * The coderef transform registers the files a slide's code comes from in
 * Slidev's `watchFiles` (setup/transformers.ts), and Slidev reloads those
 * slides when the dev server sees a change (K-09). Vite only watches the deck
 * directory and never `.git`; this plugin watches the other registered files,
 * forwarding git ref changes itself.
 */
const setup: VitePluginsSetup = (options) => {
  const known = new Set<string>()
  const gitDirs = new Set<string>()
  const pending = new Map<string, ReturnType<typeof setTimeout>>()
  let watcher: DevWatcher | undefined

  function watchGitDir(dir: string) {
    if (gitDirs.has(dir)) return
    gitDirs.add(dir)
    try {
      // Git replaces refs by renaming lock files, so the directory is watched rather than the file.
      watch(dir, (_, name) => {
        const file = name && join(dir, name.toString())
        if (!file || !known.has(file)) return
        clearTimeout(pending.get(file))
        pending.set(file, setTimeout(() => watcher?.emit('change', file), 100))
      }).unref()
    }
    catch {}
  }

  return [{
    name: 'presmium:code-watch',
    apply: 'serve',
    configureServer(server) {
      watcher = server.watcher
    },
    transform() {
      for (const file of Object.keys(options.data.watchFiles)) {
        if (known.has(file)) continue
        known.add(file)
        if (file.includes(GIT)) watchGitDir(dirname(file))
        else watcher?.add(file)
      }
      return undefined
    },
  }]
}

export default setup
