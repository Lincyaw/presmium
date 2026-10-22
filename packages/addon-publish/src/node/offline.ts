import { errorMessage } from '@lincyaw/kernel'
import { VitePWA } from 'vite-plugin-pwa'
import RemoteAssets from 'vite-plugin-remote-assets'
import webfontDownload from 'vite-plugin-webfont-dl'
import { OFFLINE_CACHE_RULES, slidevEnablesInBuild, toPublishOptions } from '../domain/index.ts'

export function offlinePlugins(config: { pwa?: unknown, remoteAssets?: unknown }, mode: string) {
  if (mode !== 'build' || !toPublishOptions(config).offline) return []
  return [
    ...(slidevEnablesInBuild(config.remoteAssets) ? [] : [remoteAssets()]),
    webfontDownload([], { throwError: false }),
    ...(slidevEnablesInBuild(config.pwa)
      ? []
      : VitePWA({
          registerType: 'autoUpdate',
          injectRegister: 'script',
          manifest: false,
          workbox: {
            globPatterns: OFFLINE_CACHE_RULES.precache,
            maximumFileSizeToCacheInBytes: OFFLINE_CACHE_RULES.maxFileBytes,
            navigateFallback: 'index.html',
            navigateFallbackDenylist: [/\/[^/?]+\.[^/]+$/],
            cleanupOutdatedCaches: true,
            clientsClaim: true,
            runtimeCaching: OFFLINE_CACHE_RULES.runtime.map(({ cacheName, urlPattern }) => ({
              urlPattern,
              handler: 'CacheFirst' as const,
              options: { cacheName, cacheableResponse: { statuses: [0, 200] } },
            })),
          },
        })),
  ]
}

type Hook = ((this: unknown, ...args: any[]) => unknown) | { handler: (this: unknown, ...args: any[]) => unknown }

function remoteAssets() {
  const plugin = RemoteAssets({ rules: [{ match: OFFLINE_CACHE_RULES.remoteAssets }] })
  const tolerant = (hook: Hook): Hook => {
    const handler = typeof hook === 'function' ? hook : hook.handler
    async function guarded(this: unknown, ...args: unknown[]) {
      try {
        return await handler.apply(this, args)
      } catch (error) {
        const file = typeof args[1] === 'string' ? args[1] : (args[1] as { filename?: string } | undefined)?.filename
        console.warn(`[presmium.publish] remote assets in ${file} stay remote, so they need network when presenting: ${errorMessage(error)}`)
        return undefined
      }
    }
    return typeof hook === 'function' ? guarded : { ...hook, handler: guarded }
  }
  return { ...plugin, transform: tolerant(plugin.transform as Hook), transformIndexHtml: tolerant(plugin.transformIndexHtml as Hook) } as typeof plugin
}
