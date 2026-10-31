#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { appPlugin, buildViewerApp } from '../src/node/viewer-app.ts'

// Image build only: prepare the common runtime, without compiling user documents.
const [cache, ...directories] = process.argv.slice(2)
if (!cache || !directories.length) throw new Error('usage: prebuild-viewer.mjs <cache> <plugin directories...>')
const plugins = (await Promise.all(directories.filter(directory => existsSync(join(directory, 'package.json'))).map(async directory => {
  // Existing prepared workspaces use paths; new/imported documents use package
  // names. The registry needs both aliases; each page loads only its configured names.
  const dir = resolve(directory), plugin = await appPlugin(dir, dir)
  if (!plugin.supported) throw new Error(`cannot prebuild viewer plugin ${dir}`)
  return [plugin, { ...plugin, name: plugin.packageName }]
}))).flat()
const started = Date.now()
const app = await buildViewerApp(resolve(cache), plugins)
console.log(JSON.stringify({ key: app.manifest.key, plugins: plugins.length, elapsedMs: Date.now() - started }))
