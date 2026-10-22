export interface OfflineManifest {
  precache: string[]
  maxFileBytes: number
  runtime: { cacheName: string, urlPattern: RegExp }[]
  remoteAssets: RegExp
}

const DECK = ['html', 'js', 'mjs', 'css', 'json', 'txt', 'md']
const MEDIA = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'woff', 'woff2', 'ttf', 'otf', 'mp4', 'webm', 'ogg', 'mp3', 'wav', 'm4a', 'pdf']
const RUNTIMES = ['wasm', 'zip', 'whl', 'tar', 'data', 'gz']
const LICENSES = ['LICENSE', 'LICENSES']

export const OFFLINE_MANIFEST: OfflineManifest = {
  precache: [`**/*.{${[...DECK, ...MEDIA, ...RUNTIMES].join(',')}}`, `**/{${LICENSES.join(',')}}`],
  maxFileBytes: 100 * 1024 * 1024,
  runtime: [
    { cacheName: 'presmium-pyodide', urlPattern: /\/pyodide[/@]/ },
    { cacheName: 'presmium-fonts', urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\// },
  ],
  remoteAssets: /\b(https?:\/\/[\w#&?./:%=+~-]*?\.(?:png|jpe?g|gif|svg|ico|webp|avif|mp4|webm|ogg|mp3|wav|woff2?|ttf|otf))(?=[`'")\]])/gi,
}

export const ASSETS_DIR = '.presmium/assets'

const TYPES: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
}

export function assetExtension(url: string, contentType: string | null): string | undefined {
  const path = (() => {
    try {
      return new URL(url).pathname
    } catch {
      return ''
    }
  })()
  const ext = /\.([a-z\d]+)$/i.exec(path)?.[1]?.toLowerCase()
  if (ext && MEDIA.includes(ext)) return ext
  return TYPES[(contentType ?? '').split(';')[0]!.trim().toLowerCase()]
}
