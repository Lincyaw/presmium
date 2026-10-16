import { errorMessage } from '@presmium/kernel'
import { VitePWA } from 'vite-plugin-pwa'
import RemoteAssets from 'vite-plugin-remote-assets'
import webfontDownload from 'vite-plugin-webfont-dl'
import { OFFLINE_MANIFEST, onInBuild, publishOptions } from '../domain/index.ts'

/**
 * Vite plugins that make `slidev build` output play offline (P-51, N-03): a
 * service worker that precaches the deck, its media and the Pyodide runtime
 * (vite-plugin-pwa, which Slidev's `pwa` option also uses), remote assets
 * downloaded into the build (vite-plugin-remote-assets, as Slidev's
 * `remoteAssets` option does), and the web fonts that Slidev links from Google
 * Fonts, downloaded into the build as well (vite-plugin-webfont-dl). A deck
 * that turns on either Slidev option keeps Slidev's own plugin for it.
 * `presmium: { presmium.publish: { offline: false } }` turns them all off.
 */
export function offlinePlugins(config: { pwa?: unknown, remoteAssets?: unknown }, mode: string) {
  if (mode !== 'build' || !publishOptions(config).offline) return []
  return [
    ...(onInBuild(config.remoteAssets) ? [] : [remoteAssets()]),
    // Without network the build only warns and keeps the remote fonts, which the service worker then caches at runtime.
    webfontDownload([], { throwError: false }),
    ...(onInBuild(config.pwa)
      ? []
      : VitePWA({
          registerType: 'autoUpdate',
          injectRegister: 'script',
          manifest: false,
          workbox: {
            globPatterns: OFFLINE_MANIFEST.precache,
            maximumFileSizeToCacheInBytes: OFFLINE_MANIFEST.maxFileBytes,
            // Slide routes get the app; files such as a downloadable PDF are served as themselves.
            navigateFallback: 'index.html',
            navigateFallbackDenylist: [/\/[^/?]+\.[^/]+$/],
            cleanupOutdatedCaches: true,
            // Control the page that installed the worker, so runtime caching already applies on the first visit.
            clientsClaim: true,
            runtimeCaching: OFFLINE_MANIFEST.runtime.map(({ cacheName, urlPattern }) => ({
              urlPattern,
              handler: 'CacheFirst' as const,
              options: { cacheName, cacheableResponse: { statuses: [0, 200] } },
            })),
          },
        })),
  ]
}

// Vite types each hook differently; this wrapper only forwards the arguments.
type Hook = ((this: unknown, ...args: any[]) => unknown) | { handler: (this: unknown, ...args: any[]) => unknown }

/**
 * vite-plugin-remote-assets fails the build when a download fails. Building
 * without network should still work, so a module whose assets cannot be
 * downloaded keeps its remote URLs and the build only warns.
 */
function remoteAssets() {
  const plugin = RemoteAssets({ rules: [{ match: OFFLINE_MANIFEST.remoteAssets }] })
  const tolerant = (hook: Hook): Hook => {
    const handler = typeof hook === 'function' ? hook : hook.handler
    async function guarded(this: unknown, ...args: unknown[]) {
      try {
        return await handler.apply(this, args)
      } catch (error) {
        // transform(code, id) or transformIndexHtml(html, { filename })
        const file = typeof args[1] === 'string' ? args[1] : (args[1] as { filename?: string } | undefined)?.filename
        console.warn(`[presmium.publish] remote assets in ${file} stay remote, so they need network when presenting: ${errorMessage(error)}`)
        return undefined
      }
    }
    return typeof hook === 'function' ? guarded : { ...hook, handler: guarded }
  }
  return { ...plugin, transform: tolerant(plugin.transform as Hook), transformIndexHtml: tolerant(plugin.transformIndexHtml as Hook) } as typeof plugin
}
