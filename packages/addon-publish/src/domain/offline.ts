import { MEDIA_EXTENSIONS } from './assets.ts'

/** What the service worker of an offline site caches (workbox's options). */
export interface OfflineCacheRules {
  precache: string[]
  maxFileBytes: number
  runtime: { cacheName: string, urlPattern: RegExp }[]
  remoteAssets: RegExp
}

const DECK = ['html', 'js', 'mjs', 'css', 'json', 'txt', 'md']
const RUNTIMES = ['wasm', 'zip', 'whl', 'tar', 'data', 'gz']
const LICENSES = ['LICENSE', 'LICENSES']

export const OFFLINE_CACHE_RULES: OfflineCacheRules = {
  precache: [`**/*.{${[...DECK, ...MEDIA_EXTENSIONS, ...RUNTIMES].join(',')}}`, `**/{${LICENSES.join(',')}}`],
  maxFileBytes: 100 * 1024 * 1024,
  runtime: [
    { cacheName: 'presmium-pyodide', urlPattern: /\/pyodide[/@]/ },
    { cacheName: 'presmium-fonts', urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\// },
  ],
  remoteAssets: /\b(https?:\/\/[\w#&?./:%=+~-]*?\.(?:png|jpe?g|gif|svg|ico|webp|avif|mp4|webm|ogg|mp3|wav|woff2?|ttf|otf))(?=[`'")\]])/gi,
}
