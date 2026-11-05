import type { Member } from './server.ts'

export const MEDIA_UPLOAD_PATH = '/__presmium/presmium.media-upload'
export const MEDIA_UPLOAD_KINDS = ['image', 'audio'] as const
export type MediaUploadKind = typeof MEDIA_UPLOAD_KINDS[number]
export interface MediaUpload {
  upload: string
  kind: MediaUploadKind
  url: string
  expiresAt: string
  maxBytes: number
  state: 'empty' | 'uploading' | 'ready'
  name?: string
  byteLength?: number
}
/** Temporary input only; canonical imports retain their existing authoring permission and transaction. */
export interface DocumentMediaUploads {
  prepare(document: string, kind: MediaUploadKind, member: Member): Promise<MediaUpload>
  status(document: string, upload: string, member: Member): Promise<MediaUpload>
}
export type DocumentMediaLocation = { path: string, upload?: never } | { upload: string, path?: never }
export type DocumentMediaFile = ({ path: string, upload?: never, name?: never } | { upload: string, name: string, path?: never }) & { sha256: string, byteLength: number }
export const MEDIA_LOCATION_PROPERTIES = { path: { type: 'string', minLength: 1, maxLength: 1024 }, upload: { type: 'string', pattern: '^[a-f0-9]{64}$' } } as const
export const MEDIA_LOCATION_CHOICES = [{ required: ['path'], not: { required: ['upload'] } }, { required: ['upload'], not: { required: ['path'] } }] as const
export const mediaFileSchema = (maxBytes: number) => ({ type: 'object', additionalProperties: false,
  properties: { ...MEDIA_LOCATION_PROPERTIES, name: { type: 'string', minLength: 1, maxLength: 200 }, sha256: { type: 'string', pattern: '^[a-f\\d]{64}$' }, byteLength: { type: 'integer', minimum: 1, maximum: maxBytes } },
  required: ['sha256', 'byteLength'], oneOf: [{ required: ['path'], not: { anyOf: [{ required: ['upload'] }, { required: ['name'] }] } }, { required: ['upload', 'name'], not: { required: ['path'] } }],
} as const)
