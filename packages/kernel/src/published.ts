import type { LocalAsset } from './ir.ts'

export interface PublishedUrlOptions {
  prefix?: string
  directoryIndex?: string
}

export function publishedUrl(found: Pick<LocalAsset, 'name' | 'directory'>, url: string, options: PublishedUrlOptions = {}): string {
  const index = found.directory ? options.directoryIndex ?? '/index.html' : ''
  return `${options.prefix ?? ''}${encodeURIComponent(found.name)}${index}${/[?#].*$/s.exec(url)?.[0] ?? ''}`
}
