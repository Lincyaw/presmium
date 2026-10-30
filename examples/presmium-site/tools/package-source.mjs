import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
mkdirSync(new URL('../public/', import.meta.url), { recursive: true })
// Include only authored, reader-facing sources; build caches and installed packages stay outside the archive.
const media = ['presmium-60s.webm', 'presmium-60s-poster.jpg', 'presmium-lesson.webm'].map(name => `public/${name}`).filter(path => existsSync(new URL(`../${path}`, import.meta.url)))
execFileSync('tar', ['-czf', 'public/presmium-source.tar.gz', '--exclude=promo/audio/score.wav', '--exclude=promo/audio/source', 'README.md', 'package.json', 'tsconfig.json', 'presmium.workspace.yaml', 'site', 'promo/lecture.json', 'promo/storyboard.md', 'promo/scenes', 'promo/audio', 'promo/assets', 'promo/tools', 'learn/lecture.json', 'learn/locales', 'learn/scenes', 'tools', ...media], { cwd: root })
console.log('public/presmium-source.tar.gz')
