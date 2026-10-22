export const ASSETS_DIR = '.presmium/assets'

export const MEDIA_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'woff', 'woff2', 'ttf', 'otf', 'mp4', 'webm', 'ogg', 'mp3', 'wav', 'm4a', 'pdf']

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
  if (ext && MEDIA_EXTENSIONS.includes(ext)) return ext
  return TYPES[(contentType ?? '').split(';')[0]!.trim().toLowerCase()]
}
