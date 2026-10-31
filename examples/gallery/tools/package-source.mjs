import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
mkdirSync(new URL('../public/', import.meta.url), { recursive: true })
// Include only authored, reader-facing sources; build caches and installed packages stay outside the archive.
const media = ['presmium-60s.webm', 'presmium-60s-poster.jpg', 'presmium-lesson.webm'].map(name => `public/${name}`).filter(path => existsSync(new URL(`../${path}`, import.meta.url)))
const documents = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(new URL(`../${entry.name}/lecture.json`, import.meta.url))).map(entry => entry.name)
// Dereference the shared skill gallery so the download works independently of this checkout.
execFileSync('tar', ['-chzf', 'public/presmium-source.tar.gz', '--exclude=node_modules', '--exclude=dist', '--exclude=.git', '--exclude=.presmium', '--exclude=promo/audio/score.wav', '--exclude=promo/audio/source', 'AGENTS.md', 'README.md', 'PRODUCT-SITE.md', 'FEATURES.md', 'features.json', 'package.json', 'tsconfig.json', 'presmium.workspace.yaml', 'site', 'tools', 'try.mjs', 'animation-library', ...documents, ...media], { cwd: root })
console.log('public/presmium-source.tar.gz')
