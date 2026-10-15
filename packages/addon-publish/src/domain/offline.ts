/**
 * Offline manifest (P-51): what the service worker of a built deck caches.
 * Every build output of these types is precached, so a deck that has been
 * opened once plays without network.
 */
export interface OfflineManifest {
  /** Globs over the build output, precached when the service worker installs. */
  precache: string[]
  /** Larger files are skipped by the precache. */
  maxFileBytes: number
  /** Requests cached the first time they are made (cache first). */
  runtime: { cacheName: string, urlPattern: RegExp }[]
  /** Remote media URLs in the deck source that the build downloads and serves itself. */
  remoteAssets: RegExp
}

const DECK = ['html', 'js', 'mjs', 'css', 'json', 'txt', 'md']
/** Media and fonts, including remote assets downloaded at build time. */
const MEDIA = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'woff', 'woff2', 'ttf', 'otf', 'mp4', 'webm', 'ogg', 'mp3', 'wav', 'm4a', 'pdf']
/** The Pyodide runtime and its packages when they are part of the build. */
const PYODIDE = ['wasm', 'zip', 'whl', 'tar', 'data']

export const OFFLINE_MANIFEST: OfflineManifest = {
  precache: [`**/*.{${[...DECK, ...MEDIA, ...PYODIDE].join(',')}}`],
  // Same limit as Slidev's own PWA option; the Pyodide wasm alone is about 10 MB.
  maxFileBytes: 100 * 1024 * 1024,
  runtime: [
    // Pyodide loaded from a CDN (cdn.jsdelivr.net/pyodide/..., .../npm/pyodide@...) or lazily from the deck.
    { cacheName: 'presmium-pyodide', urlPattern: /\/pyodide[/@]/ },
    // Web fonts that Slidev imports from Google Fonts, when the build could not download them.
    { cacheName: 'presmium-fonts', urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\// },
  ],
  // Like vite-plugin-remote-assets' default rule, plus hosts with a port, GIF, AVIF, video, audio and fonts.
  remoteAssets: /\b(https?:\/\/[\w#&?./:%=+~-]*?\.(?:png|jpe?g|gif|svg|ico|webp|avif|mp4|webm|ogg|mp3|wav|woff2?|ttf|otf))(?=[`'")\]])/gi,
}
